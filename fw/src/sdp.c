#include "sdp.h"
#include <btstack.h>
#include <stdio.h>

static uint8_t sdp_avdtp_sink_service_buffer[200];
static uint8_t sdp_avrcp_controller_service_buffer[200];
static uint8_t sdp_avrcp_target_service_buffer[200];
static uint8_t device_id_sdp_service_buffer[100];

static void sdp_register_headphone(void) {
    memset(sdp_avdtp_sink_service_buffer, 0, sizeof(sdp_avdtp_sink_service_buffer));
    a2dp_sink_create_sdp_record(sdp_avdtp_sink_service_buffer,
                               sdp_create_service_record_handle(),
                               AVDTP_SINK_FEATURE_MASK_HEADPHONE, NULL, NULL);
    sdp_register_service(sdp_avdtp_sink_service_buffer);
    printf("[sdp] headphone done\n");
}

static void sdp_register_player(void) {
    memset(sdp_avrcp_controller_service_buffer, 0, sizeof(sdp_avrcp_controller_service_buffer));
    uint16_t controller_supported_features = 1 << AVRCP_CONTROLLER_SUPPORTED_FEATURE_CATEGORY_PLAYER_OR_RECORDER;
    avrcp_controller_create_sdp_record(sdp_avrcp_controller_service_buffer,
                                      sdp_create_service_record_handle(),
                                      controller_supported_features, NULL, NULL);
    sdp_register_service(sdp_avrcp_controller_service_buffer);
    printf("[sdp] player done\n");
}

static void sdp_register_monitor(void) {
    memset(sdp_avrcp_target_service_buffer, 0, sizeof(sdp_avrcp_target_service_buffer));
    uint16_t target_supported_features = 1 << AVRCP_TARGET_SUPPORTED_FEATURE_CATEGORY_MONITOR_OR_AMPLIFIER;
    avrcp_target_create_sdp_record(sdp_avrcp_target_service_buffer,
                                  sdp_create_service_record_handle(),
                                  target_supported_features, NULL, NULL);
    sdp_register_service(sdp_avrcp_target_service_buffer);
    printf("[sdp] monitor done\n");
}

static void sdp_register_device_id(void) {
    memset(device_id_sdp_service_buffer, 0, sizeof(device_id_sdp_service_buffer));
    device_id_create_sdp_record(device_id_sdp_service_buffer,
                               sdp_create_service_record_handle(),
                               DEVICE_ID_VENDOR_ID_SOURCE_BLUETOOTH,
                               BLUETOOTH_COMPANY_ID_BLUEKITCHEN_GMBH, 1, 1);
    sdp_register_service(device_id_sdp_service_buffer);
    printf("[sdp] device_id done\n");
}

void sdp_begin(void) {
    sdp_register_headphone();
    sdp_register_player();
    sdp_register_monitor();
    sdp_register_device_id();
}