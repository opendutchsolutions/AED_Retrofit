/**
 * @file            a2dp.c
 * @brief           A2DP sink implementation for SBC audio streaming over
 * Bluetooth
 *
 * @par
 * Copyright 2025 (C) Joba-1 (Modified by OpenDutchSolutions Foundation)
 *
 * Licensed under the EUPL, Version 1.2 only (the "Licence");
 * you may not use this file except in compliance with the Licence.
 * You may obtain a copy of the Licence at:
 *
 *     https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the Licence is distributed on an "AS IS" basis,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the Licence for the specific language governing permissions and
 * limitations under the Licence.
 *
 * This file is part of the AED_RETROFIT project
 *
 * Author:    Joba-1
 *            Hoog-V
 *
 * Modifications made:
 * - Document & Restructure code
 * - Remove commented code blocks
 * - Fix release-build bug where `sbc_configuration`
 *   variable went out-of-scope (and out-of-stack) but got referenced afterwards
 * by the stack
 * - Move large variables from stack to global RAM and made ISR referenced
 * variables volatile
 * - Made global variables static, so that they don't pollute the global
 * namespace
 */

#include "a2dp.h"

#include "hardware/watchdog.h"
#include <btstack.h>
#include <btstack_resample.h>
#include <classic/a2dp_sink.h>
#include <pico/cyw43_arch.h>

#include "avrcp.h"
#include <math.h>
#include "board_config.h"

const btstack_audio_sink_t *btstack_audio_pico_sink_get_instance(void);

#define OPTIMAL_FRAMES_MIN 60
#define OPTIMAL_FRAMES_MAX 120
#define ADDITIONAL_FRAMES 30
#define NUM_CHANNELS 2
#define BYTES_PER_FRAME (2 * NUM_CHANNELS)
#define MAX_SBC_FRAME_SIZE 120

typedef struct {
  uint8_t reconfigure;
  uint8_t num_channels;
  uint16_t sampling_frequency;
  uint8_t block_length;
  uint8_t subbands;
  uint8_t min_bitpool_value;
  uint8_t max_bitpool_value;
  btstack_sbc_channel_mode_t channel_mode;
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
    0xFF, // (AVDTP_SBC_44100 << 4) | AVDTP_SBC_STEREO,
    0xFF, // (AVDTP_SBC_BLOCK_LENGTH_16 << 4) | (AVDTP_SBC_SUBBANDS_8 << 2) |
          // AVDTP_SBC_ALLOCATION_METHOD_LOUDNESS
    2, 53};

static uint8_t _seid = 0;
static stream_state_t _stream_state = STREAM_STATE_CLOSED;
static volatile uint8_t _sbc_config_ready = 0;
static sbc_configuration_t _sbc_configuration = {0};
static btstack_sbc_decoder_state_t _state = {0};

static btstack_resample_t _resample_instance = {0};
static btstack_ring_buffer_t _sbc_frame_ring_buffer = {0};
static btstack_ring_buffer_t _decoded_audio_ring_buffer = {0};
static uint8_t _sbc_frame_storage[(OPTIMAL_FRAMES_MAX + ADDITIONAL_FRAMES) *
                                  MAX_SBC_FRAME_SIZE] = {0};
static uint8_t _decoded_audio_storage[(128 + 16) * BYTES_PER_FRAME] = {0};

static volatile unsigned _sbc_frame_size = 0;
static volatile bool _media_initialized = false;
static volatile bool _audio_stream_started = false;
static volatile int16_t *_request_buffer = 0;
static volatile int _request_frames = 0;

static int16_t output_buffer[(128 + 16) * NUM_CHANNELS];
static uint8_t sbc_frame[MAX_SBC_FRAME_SIZE];
static uint8_t sbc_configuration[4];

/**
 * Process volume on decoded frames and send to I2S buffer or ring buffer.
 */

// --- PCM channel analyzer (serial: "pcmtest <blocks>" / "pcmreport") ---
// Measures per-slot tone energy (Goertzel, 128-sample blocks at the
// configured sample rate) to characterize what the SBC/A2DP channel
// does to candidate modem frequencies.
#define PCM_BLOCK 128u
#define PCM_SLOTS 40u

static volatile uint32_t _pcm_blocks_left = 0;
static uint32_t _pcm_blocks_done = 0;
static float _pcm_coeff[PCM_SLOTS];
static float _pcm_min[PCM_SLOTS];
static float _pcm_max[PCM_SLOTS];
static double _pcm_sum[PCM_SLOTS];
static int16_t _pcm_rem[PCM_BLOCK];
static uint32_t _pcm_rem_len = 0;
static uint32_t _pcm_fs = 48000;

void a2dp_pcm_analyze_start(uint32_t blocks) {
  _pcm_fs = _sbc_configuration.sampling_frequency
                ? _sbc_configuration.sampling_frequency
                : 48000;
  for (uint32_t k = 0; k < PCM_SLOTS; k++) {
    float freq = (float)(k + 1) * ((float)_pcm_fs / (float)PCM_BLOCK);
    float w = 2.0f * 3.14159265f * freq / (float)_pcm_fs;
    _pcm_coeff[k] = 2.0f * cosf(w);
    _pcm_min[k] = 1e30f;
    _pcm_max[k] = 0.0f;
    _pcm_sum[k] = 0.0;
  }
  _pcm_blocks_done = 0;
  _pcm_rem_len = 0;
  _pcm_blocks_left = blocks; // volatile store last
  printf("[pcm] analyzing %u blocks at %u Hz\n", blocks, (unsigned)_pcm_fs);
}

static void pcm_analyze_block(const int16_t *x) {
  for (uint32_t k = 0; k < PCM_SLOTS; k++) {
    float coeff = _pcm_coeff[k];
    float s1 = 0.0f, s2 = 0.0f;
    for (uint32_t i = 0; i < PCM_BLOCK; i++) {
      float s0 = x[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    float power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    if (power < _pcm_min[k]) _pcm_min[k] = power;
    if (power > _pcm_max[k]) _pcm_max[k] = power;
    _pcm_sum[k] += power;
  }
  _pcm_blocks_done++;
}

void a2dp_pcm_analyze_report(void) {
  if (_pcm_blocks_done == 0) {
    printf("[pcm] no data (was a stream playing?)\n");
    return;
  }
  printf("[pcm] %u blocks analyzed at %u Hz\n", _pcm_blocks_done,
         (unsigned)_pcm_fs);
  for (uint32_t k = 0; k < PCM_SLOTS; k++) {
    float freq = (float)(k + 1) * ((float)_pcm_fs / (float)PCM_BLOCK);
    printf("[pcm] slot %2u (%6.0f Hz): min %8ld max %8ld mean %8ld (u6)\n",
           k + 1, (double)freq, (long)(_pcm_min[k] / 1e6),
           (long)(_pcm_max[k] / 1e6),
           (long)((_pcm_sum[k] / _pcm_blocks_done) / 1e6));
  }
}

static void handle_pcm_data(int16_t *data, int num_audio_frames,
                            int num_channels, int sample_rate, void *context) {
  UNUSED(sample_rate);
  UNUSED(context);
  UNUSED(num_channels); // Must be stereo == 2

  // Channel analyzer tap: buffer the left channel into 128-sample
  // blocks and run the per-slot Goertzel while a test stream plays.
  if (_pcm_blocks_left > 0) {
    for (int i = 0; i < num_audio_frames && _pcm_blocks_left > 0; i++) {
      _pcm_rem[_pcm_rem_len++] = data[2 * i];
      if (_pcm_rem_len == PCM_BLOCK) {
        _pcm_rem_len = 0;
        _pcm_blocks_left--; // volatile
        pcm_analyze_block(_pcm_rem);
      }
    }
    if (_pcm_blocks_left == 0) {
      printf("[pcm] analysis complete\n");
    }
  }

  const btstack_audio_sink_t *audio_sink = btstack_audio_sink_get_instance();
  if (!audio_sink) {
    return;
  }

  // Adjust volume
  int32_t volume = 1L + avrcp_get_volume(); // 1..128
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
  uint32_t resampled_frames = btstack_resample_block(
      &_resample_instance, data, num_audio_frames, output_buffer);

  int16_t *req_buf = (int16_t *)_request_buffer;
  int req_frames = _request_frames;

  int frames_to_copy = btstack_min(resampled_frames, req_frames);
  memcpy(req_buf, output_buffer, frames_to_copy * BYTES_PER_FRAME);
  _request_frames -= frames_to_copy;
  _request_buffer += frames_to_copy * NUM_CHANNELS;

  // Store the rest in ring buffer
  int frames_to_store = resampled_frames - frames_to_copy;
  if (frames_to_store) {
    btstack_ring_buffer_write(
        &_decoded_audio_ring_buffer,
        (uint8_t *)&output_buffer[frames_to_copy * NUM_CHANNELS],
        frames_to_store * BYTES_PER_FRAME);
  }
}

/**
 * Provide PCM frames to I2S sink.
 */
static void playback_handler(int16_t *buffer, uint16_t num_audio_frames) {
  if (_sbc_frame_size == 0) {
    memset(buffer, 0, num_audio_frames * BYTES_PER_FRAME);
    return;
  }

  uint32_t bytes_read;
  btstack_ring_buffer_read(&_decoded_audio_ring_buffer, (uint8_t *)buffer,
                           num_audio_frames * BYTES_PER_FRAME, &bytes_read);
  buffer += bytes_read / NUM_CHANNELS;
  num_audio_frames -= bytes_read / BYTES_PER_FRAME;

  // Use local non-volatile copies for pointer arithmetic
  int16_t *req_buf = (int16_t *)_request_buffer;
  int req_frames = _request_frames;

  _request_buffer = buffer;
  _request_frames = num_audio_frames;

  while (_request_frames && btstack_ring_buffer_bytes_available(
                                &_sbc_frame_ring_buffer) >= _sbc_frame_size) {
    btstack_ring_buffer_read(&_sbc_frame_ring_buffer, sbc_frame,
                             _sbc_frame_size, &bytes_read);
    btstack_sbc_decoder_process_data(&_state, 0, sbc_frame, _sbc_frame_size);
  }
}

static void media_processing_init(sbc_configuration_t *configuration) {
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
  const btstack_audio_sink_t *audio = btstack_audio_sink_get_instance();
  if (audio) {
    audio->init(NUM_CHANNELS, configuration->sampling_frequency,
                &playback_handler);
  }

  _audio_stream_started = false;
  _media_initialized = true;
}

static void media_processing_start(void) {
  if (!_media_initialized) {
    return;
  }

  // Setup audio playback
  const btstack_audio_sink_t *audio = btstack_audio_sink_get_instance();
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

  const btstack_audio_sink_t *audio = btstack_audio_sink_get_instance();
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
  const btstack_audio_sink_t *audio = btstack_audio_sink_get_instance();
  if (audio) {
    audio->close();
  }
}

static void event_handler(uint8_t event, uint8_t *packet) {
  uint8_t status;
  uint8_t allocation_method;
  _last_event = event; // Logged safely by timer, not here

  switch (event) {
  case A2DP_SUBEVENT_SIGNALING_MEDIA_CODEC_SBC_CONFIGURATION: {
    _sbc_configuration.reconfigure =
        a2dp_subevent_signaling_media_codec_sbc_configuration_get_reconfigure(
            packet);
    _sbc_configuration.num_channels =
        a2dp_subevent_signaling_media_codec_sbc_configuration_get_num_channels(
            packet);
    _sbc_configuration.sampling_frequency =
        a2dp_subevent_signaling_media_codec_sbc_configuration_get_sampling_frequency(
            packet);
    _sbc_configuration.block_length =
        a2dp_subevent_signaling_media_codec_sbc_configuration_get_block_length(
            packet);
    _sbc_configuration.subbands =
        a2dp_subevent_signaling_media_codec_sbc_configuration_get_subbands(
            packet);
    _sbc_configuration.min_bitpool_value =
        a2dp_subevent_signaling_media_codec_sbc_configuration_get_min_bitpool_value(
            packet);
    _sbc_configuration.max_bitpool_value =
        a2dp_subevent_signaling_media_codec_sbc_configuration_get_max_bitpool_value(
            packet);

    allocation_method =
        a2dp_subevent_signaling_media_codec_sbc_configuration_get_allocation_method(
            packet);

    // Adapt Bluetooth spec definition to SBC Encoder expected input
    _sbc_configuration.allocation_method =
        (btstack_sbc_allocation_method_t)(allocation_method - 1);

    switch (
        a2dp_subevent_signaling_media_codec_sbc_configuration_get_channel_mode(
            packet)) {
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
    printf("[a2dp] stream started, reconfigure=%d\n", _sbc_configuration.reconfigure);
    if (_sbc_configuration.reconfigure) {
      media_processing_close();
    }
    // Prepare media processing
    media_processing_init(&_sbc_configuration);
    printf("[a2dp] media processing initialized\n");
    // Audio stream is started when buffer reaches minimal level
    break;

  case A2DP_SUBEVENT_STREAM_SUSPENDED:
    _stream_state = STREAM_STATE_PAUSED;
    media_processing_pause();
    break;

  case A2DP_SUBEVENT_STREAM_RELEASED:
    _stream_state = STREAM_STATE_CLOSED;
    media_processing_close();
    // No reboot here: a watchdog reset re-triggers the bootrom's TBYB
    // flash-update cycle. Reconnection of the classic link is handled by
    // the kv-store peer + bt_reconnect_classic on the next BLE connect.
    break;

  case A2DP_SUBEVENT_SIGNALING_CONNECTION_RELEASED:
    break;

  default:
    break;
  }
}

static void data_handler(uint8_t packet_type, uint16_t channel, uint8_t *packet,
                         uint16_t size) {
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
  int media_header_len = 12; // Without CRC
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

static int read_sbc_header(uint8_t *packet, int size, int *offset,
                           avdtp_sbc_codec_header_t *sbc_header) {
  int sbc_header_len = 12; // Without CRC
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
  static uint32_t _media_packets = 0;
  if (_media_packets == 0) {
    printf("[a2dp] first media packet, %u bytes\n", size);
  }
  _media_packets++;

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
  btstack_ring_buffer_write(&_sbc_frame_ring_buffer, packet_begin,
                            packet_length);

  // Decide on audio sync drift based on number of SBC frames in queue
  int sbc_frames_in_buffer =
      btstack_ring_buffer_bytes_available(&_sbc_frame_ring_buffer) /
      _sbc_frame_size;

  // Nominal factor (fixed-point 2^16) and compensation offset
  uint32_t nominal_factor = 0x10000;
  uint32_t compensation = 0x00100;
  uint32_t resampling_factor;

  if (sbc_frames_in_buffer < OPTIMAL_FRAMES_MIN) {
    resampling_factor = nominal_factor - compensation; // Stretch samples
  } else if (sbc_frames_in_buffer <= OPTIMAL_FRAMES_MAX) {
    resampling_factor = nominal_factor; // Nothing to do
  } else {
    resampling_factor = nominal_factor + compensation; // Compress samples
  }

  btstack_resample_set_factor(&_resample_instance, resampling_factor);

  // Start stream if enough frames buffered
  if (!_audio_stream_started &&
      sbc_frames_in_buffer >= (OPTIMAL_FRAMES_MIN + OPTIMAL_FRAMES_MAX) / 2) {
    media_processing_start();
  }
}

void a2dp_sink_begin(void) {
  // Init I2S interface
  btstack_audio_sink_set_instance(btstack_audio_pico_sink_get_instance());

  a2dp_sink_init();

  a2dp_sink_register_packet_handler(&data_handler);
  a2dp_sink_register_media_handler(&media_handler);

  avdtp_stream_endpoint_t *endpoint = a2dp_sink_create_stream_endpoint(
      AVDTP_AUDIO, AVDTP_CODEC_SBC, _sbc_capabilities,
      sizeof(_sbc_capabilities), sbc_configuration, sizeof(sbc_configuration));
  _seid = avdtp_local_seid(endpoint);
}

uint8_t a2dp_sink_connect_peer(bd_addr_t remote) {
  uint16_t a2dp_cid = 0;
  uint8_t status = a2dp_sink_establish_stream(remote, &a2dp_cid);
  printf("[a2dp] outgoing connect status=0x%02x\n", status);
  return status;
}