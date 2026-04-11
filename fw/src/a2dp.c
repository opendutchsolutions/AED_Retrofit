#include "a2dp.h"

#include <btstack.h>
#include <btstack_resample.h>
#include <classic/a2dp_sink.h>
#include "hardware/watchdog.h"
#include <pico/cyw43_arch.h>

#include "avrcp.h"
#include "board_config.h"

const btstack_audio_sink_t * btstack_audio_pico_sink_get_instance(void);

#define OPTIMAL_FRAMES_MIN 60
#define OPTIMAL_FRAMES_MAX 120
#define ADDITIONAL_FRAMES  30
#define NUM_CHANNELS       2
#define BYTES_PER_FRAME    (2 * NUM_CHANNELS)
#define MAX_SBC_FRAME_SIZE 120


typedef struct {
    uint8_t  reconfigure;
    uint8_t  num_channels;
    uint16_t sampling_frequency;
    uint8_t  block_length;
    uint8_t  subbands;
    uint8_t  min_bitpool_value;
    uint8_t  max_bitpool_value;
    btstack_sbc_channel_mode_t      channel_mode;
    btstack_sbc_allocation_method_t allocation_method;
} sbc_configuration_t;

typedef enum {
    STREAM_STATE_CLOSED,
    STREAM_STATE_OPEN,
    STREAM_STATE_PLAYING,
    STREAM_STATE_PAUSED,
} stream_state_t;


static volatile uint8_t _last_event = 0;

static const uint8_t _sbc_capabilities[] = {
    0xFF,  // (AVDTP_SBC_44100 << 4) | AVDTP_SBC_STEREO,
    0xFF,  // (AVDTP_SBC_BLOCK_LENGTH_16 << 4) | (AVDTP_SBC_SUBBANDS_8 << 2) | AVDTP_SBC_ALLOCATION_METHOD_LOUDNESS
    2, 53
};

static uint8_t _seid = 0;
static stream_state_t _stream_state = STREAM_STATE_CLOSED;
static volatile uint8_t _sbc_config_ready = 0;
static sbc_configuration_t _sbc_configuration = {0};
static btstack_sbc_decoder_state_t _state = {0};

static btstack_resample_t _resample_instance = {0};
static btstack_ring_buffer_t _sbc_frame_ring_buffer = {0};
static btstack_ring_buffer_t _decoded_audio_ring_buffer = {0};
static uint8_t _sbc_frame_storage[(OPTIMAL_FRAMES_MAX + ADDITIONAL_FRAMES) * MAX_SBC_FRAME_SIZE] = {0};
static uint8_t _decoded_audio_storage[(128 + 16) * BYTES_PER_FRAME] = {0};

static volatile unsigned _sbc_frame_size = 0;
static volatile bool _media_initialized = false;
static volatile bool _audio_stream_started = false;
static volatile int16_t * _request_buffer = 0;
static volatile int _request_frames = 0;

static int16_t output_buffer[(128 + 16) * NUM_CHANNELS];
static uint8_t sbc_frame[MAX_SBC_FRAME_SIZE];
static uint8_t sbc_configuration[4];


/**
 * Process volume on decoded frames and send to I2S buffer or ring buffer.
 */
static void handle_pcm_data(int16_t * data, int num_audio_frames, int num_channels, 
                            int sample_rate, void * context) {
    UNUSED(sample_rate);
    UNUSED(context);
    UNUSED(num_channels);   // Must be stereo == 2

    const btstack_audio_sink_t * audio_sink = btstack_audio_sink_get_instance();
    if (!audio_sink) {
        return;
    }

    // Adjust volume
    int32_t volume = 1L + avrcp_get_volume();  // 1..128
    int32_t samples = num_audio_frames * NUM_CHANNELS;
    int32_t sample;

    for (size_t i = 0; i < samples; ++i) {
        sample = (volume * data[i]) >> 7;
        if (sample < INT16_MIN) {
            data[i] = INT16_MIN;
        } else if (sample > INT16_MAX) {
            data[i] = INT16_MAX;
        } else {
            data[i] = sample;
        }
    }

    // Resample into request buffer - add some additional space for resampling
    uint32_t resampled_frames = btstack_resample_block(&_resample_instance, data, 
                                                       num_audio_frames, output_buffer);

    int16_t *req_buf = (int16_t *)_request_buffer;
    int req_frames = _request_frames;

    int frames_to_copy = btstack_min(resampled_frames, req_frames);
    memcpy(req_buf, output_buffer, frames_to_copy * BYTES_PER_FRAME);
    _request_frames -= frames_to_copy;
    _request_buffer += frames_to_copy * NUM_CHANNELS;

    // Store the rest in ring buffer
    int frames_to_store = resampled_frames - frames_to_copy;
    if (frames_to_store) {
        btstack_ring_buffer_write(&_decoded_audio_ring_buffer, 
                                 (uint8_t *)&output_buffer[frames_to_copy * NUM_CHANNELS], 
                                 frames_to_store * BYTES_PER_FRAME);
    }
}

/**
 * Provide PCM frames to I2S sink.
 */
static void playback_handler(int16_t * buffer, uint16_t num_audio_frames) {
    if (_sbc_frame_size == 0) {
        memset(buffer, 0, num_audio_frames * BYTES_PER_FRAME);
        return;
    }

    uint32_t bytes_read;
    btstack_ring_buffer_read(&_decoded_audio_ring_buffer,
                            (uint8_t *)buffer, num_audio_frames * BYTES_PER_FRAME, 
                            &bytes_read);
    buffer += bytes_read / NUM_CHANNELS;
    num_audio_frames -= bytes_read / BYTES_PER_FRAME;

    // Use local non-volatile copies for pointer arithmetic
    int16_t *req_buf = (int16_t *)_request_buffer;
    int req_frames = _request_frames;

    _request_buffer = buffer;
    _request_frames = num_audio_frames;

    while (_request_frames &&
           btstack_ring_buffer_bytes_available(&_sbc_frame_ring_buffer) >= _sbc_frame_size) {
        btstack_ring_buffer_read(&_sbc_frame_ring_buffer, sbc_frame, _sbc_frame_size, 
                                &bytes_read);
        btstack_sbc_decoder_process_data(&_state, 0, sbc_frame, _sbc_frame_size);
    }
}


static void media_processing_init(sbc_configuration_t * configuration) {
    if (_media_initialized) {
        return;
    }

    btstack_sbc_decoder_init(&_state, SBC_MODE_STANDARD, handle_pcm_data, NULL);

    btstack_ring_buffer_init(&_sbc_frame_ring_buffer, _sbc_frame_storage, 
                            sizeof(_sbc_frame_storage));
    btstack_ring_buffer_init(&_decoded_audio_ring_buffer, _decoded_audio_storage, 
                            sizeof(_decoded_audio_storage));
    btstack_resample_init(&_resample_instance, configuration->num_channels);

    // Setup audio playback
    const btstack_audio_sink_t * audio = btstack_audio_sink_get_instance();
    if (audio) {
        audio->init(NUM_CHANNELS, configuration->sampling_frequency, &playback_handler);
    }

    _audio_stream_started = false;
    _media_initialized = true;
}

static void media_processing_start(void) {
    if (!_media_initialized) {
        return;
    }

    // Setup audio playback
    const btstack_audio_sink_t * audio = btstack_audio_sink_get_instance();
    if (audio) {
        audio->start_stream();
    }
    _audio_stream_started = true;
}

static void media_processing_pause(void) {
    if (!_media_initialized) {
        return;
    }

    // Stop audio playback
    _audio_stream_started = false;

    const btstack_audio_sink_t * audio = btstack_audio_sink_get_instance();
    if (audio) {
        audio->stop_stream();
    }

    // Discard pending data
    btstack_ring_buffer_reset(&_decoded_audio_ring_buffer);
    btstack_ring_buffer_reset(&_sbc_frame_ring_buffer);
}

static void media_processing_close(void) {
    if (!_media_initialized) {
        return;
    }

    _media_initialized = false;
    _audio_stream_started = false;
    _sbc_frame_size = 0;

    // Stop audio playback
    const btstack_audio_sink_t * audio = btstack_audio_sink_get_instance();
    if (audio) {
        audio->close();
    }
}


static void event_handler(uint8_t event, uint8_t *packet) {
    uint8_t status;
    uint8_t allocation_method;
    _last_event = event;  // Logged safely by timer, not here

    switch (event) {
        case A2DP_SUBEVENT_SIGNALING_MEDIA_CODEC_SBC_CONFIGURATION: {
            _sbc_configuration.reconfigure = 
                a2dp_subevent_signaling_media_codec_sbc_configuration_get_reconfigure(packet);
            _sbc_configuration.num_channels = 
                a2dp_subevent_signaling_media_codec_sbc_configuration_get_num_channels(packet);
            _sbc_configuration.sampling_frequency = 
                a2dp_subevent_signaling_media_codec_sbc_configuration_get_sampling_frequency(packet);
            _sbc_configuration.block_length = 
                a2dp_subevent_signaling_media_codec_sbc_configuration_get_block_length(packet);
            _sbc_configuration.subbands = 
                a2dp_subevent_signaling_media_codec_sbc_configuration_get_subbands(packet);
            _sbc_configuration.min_bitpool_value = 
                a2dp_subevent_signaling_media_codec_sbc_configuration_get_min_bitpool_value(packet);
            _sbc_configuration.max_bitpool_value = 
                a2dp_subevent_signaling_media_codec_sbc_configuration_get_max_bitpool_value(packet);

            allocation_method = 
                a2dp_subevent_signaling_media_codec_sbc_configuration_get_allocation_method(packet);

            // Adapt Bluetooth spec definition to SBC Encoder expected input
            _sbc_configuration.allocation_method = (btstack_sbc_allocation_method_t)(allocation_method - 1);

            switch (a2dp_subevent_signaling_media_codec_sbc_configuration_get_channel_mode(packet)) {
                case AVDTP_CHANNEL_MODE_JOINT_STEREO:
                    _sbc_configuration.channel_mode = SBC_CHANNEL_MODE_JOINT_STEREO;
                    break;
                case AVDTP_CHANNEL_MODE_STEREO:
                    _sbc_configuration.channel_mode = SBC_CHANNEL_MODE_STEREO;
                    break;
                case AVDTP_CHANNEL_MODE_DUAL_CHANNEL:
                    _sbc_configuration.channel_mode = SBC_CHANNEL_MODE_DUAL_CHANNEL;
                    break;
                case AVDTP_CHANNEL_MODE_MONO:
                    _sbc_configuration.channel_mode = SBC_CHANNEL_MODE_MONO;
                    break;
                default:
                    btstack_assert(false);
                    break;
            }
            break;
        }

        case A2DP_SUBEVENT_STREAM_ESTABLISHED:
            status = a2dp_subevent_stream_established_get_status(packet);
            printf("[a2dp] stream established status=0x%02x\n", status);
            if (status != ERROR_CODE_SUCCESS) {
                break;
            }
            _seid = a2dp_subevent_stream_established_get_local_seid(packet);
            _stream_state = STREAM_STATE_OPEN;
            printf("[a2dp] seid=%d, setting LEDs\n", _seid);
            gpio_put(STATUS_LED_R_PIN, 0);
            printf("[a2dp] stream open\n");
            break;

        case A2DP_SUBEVENT_STREAM_STARTED:
            _stream_state = STREAM_STATE_PLAYING;
            if (_sbc_configuration.reconfigure) {
                media_processing_close();
            }
            // Prepare media processing
            media_processing_init(&_sbc_configuration);
            // Audio stream is started when buffer reaches minimal level
            break;

        case A2DP_SUBEVENT_STREAM_SUSPENDED:
            _stream_state = STREAM_STATE_PAUSED;
            media_processing_pause();
            break;

        case A2DP_SUBEVENT_STREAM_RELEASED:
            _stream_state = STREAM_STATE_CLOSED;
            media_processing_close();
            // Reboot in 0.1s, since reconnect is buggy
            watchdog_enable(100, true);
            break;

        case A2DP_SUBEVENT_SIGNALING_CONNECTION_RELEASED:
            break;

        default:
            break;
    }
}

static void data_handler(uint8_t packet_type, uint16_t channel, uint8_t *packet, uint16_t size) {
    UNUSED(channel);
    UNUSED(size);

    if (packet_type != HCI_EVENT_PACKET) {
        return;
    }
    if (hci_event_packet_get_type(packet) != HCI_EVENT_A2DP_META) {
        return;
    }

    event_handler(packet[2], packet);
}


static int read_media_header(uint8_t *packet, int size, int *offset, 
                             avdtp_media_packet_header_t *media_header) {
    int media_header_len = 12;  // Without CRC
    int pos = *offset;

    if (size - pos < media_header_len) {
        return 0;
    }

    media_header->version = packet[pos] & 0x03;
    media_header->padding = get_bit16(packet[pos], 2);
    media_header->extension = get_bit16(packet[pos], 3);
    media_header->csrc_count = (packet[pos] >> 4) & 0x0F;
    pos++;

    media_header->marker = get_bit16(packet[pos], 0);
    media_header->payload_type = (packet[pos] >> 1) & 0x7F;
    pos++;

    media_header->sequence_number = big_endian_read_16(packet, pos);
    pos += 2;

    media_header->timestamp = big_endian_read_32(packet, pos);
    pos += 4;

    media_header->synchronization_source = big_endian_read_32(packet, pos);
    pos += 4;

    *offset = pos;
    return 1;
}

static int read_sbc_header(uint8_t * packet, int size, int * offset, 
                          avdtp_sbc_codec_header_t * sbc_header) {
    int sbc_header_len = 12;  // Without CRC
    int pos = *offset;

    if (size - pos < sbc_header_len) {
        return 0;
    }

    sbc_header->fragmentation = get_bit16(packet[pos], 7);
    sbc_header->starting_packet = get_bit16(packet[pos], 6);
    sbc_header->last_packet = get_bit16(packet[pos], 5);
    sbc_header->num_frames = packet[pos] & 0x0f;
    pos++;

    *offset = pos;
    return 1;
}


static void media_handler(uint8_t seid, uint8_t *packet, uint16_t size) {
    UNUSED(seid);

    int pos = 0;

    avdtp_media_packet_header_t media_header;
    if (!read_media_header(packet, size, &pos, &media_header)) {
        return;
    }

    avdtp_sbc_codec_header_t sbc_header;
    if (!read_sbc_header(packet, size, &pos, &sbc_header)) {
        return;
    }

    int packet_length = size - pos;
    uint8_t *packet_begin = packet + pos;

    // Store SBC frame size for buffer management
    _sbc_frame_size = packet_length / sbc_header.num_frames;
    btstack_ring_buffer_write(&_sbc_frame_ring_buffer, packet_begin, packet_length);

    // Decide on audio sync drift based on number of SBC frames in queue
    int sbc_frames_in_buffer = btstack_ring_buffer_bytes_available(&_sbc_frame_ring_buffer) 
                               / _sbc_frame_size;

    // Nominal factor (fixed-point 2^16) and compensation offset
    uint32_t nominal_factor = 0x10000;
    uint32_t compensation   = 0x00100;
    uint32_t resampling_factor;

    if (sbc_frames_in_buffer < OPTIMAL_FRAMES_MIN) {
        resampling_factor = nominal_factor - compensation;    // Stretch samples
    } else if (sbc_frames_in_buffer <= OPTIMAL_FRAMES_MAX) {
        resampling_factor = nominal_factor;                   // Nothing to do
    } else {
        resampling_factor = nominal_factor + compensation;    // Compress samples
    }

    btstack_resample_set_factor(&_resample_instance, resampling_factor);

    // Start stream if enough frames buffered
    if (!_audio_stream_started && sbc_frames_in_buffer >= (OPTIMAL_FRAMES_MIN + OPTIMAL_FRAMES_MAX) / 2) {
        media_processing_start();
    }
}


void a2dp_sink_begin(void) {
    // Init I2S interface
    btstack_audio_sink_set_instance(btstack_audio_pico_sink_get_instance());

    a2dp_sink_init();

    a2dp_sink_register_packet_handler(&data_handler);
    a2dp_sink_register_media_handler(&media_handler);

    avdtp_stream_endpoint_t * endpoint = a2dp_sink_create_stream_endpoint(
        AVDTP_AUDIO, AVDTP_CODEC_SBC,
        _sbc_capabilities, sizeof(_sbc_capabilities),
        sbc_configuration, sizeof(sbc_configuration));
    _seid = avdtp_local_seid(endpoint);
}