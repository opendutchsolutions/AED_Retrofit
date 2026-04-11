/**
 * @file            avrcp.c
 * @brief           AVRCP controller and target implementation for Bluetooth
 *                  playback status and volume control
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
 * - Added explicit (void) to functions with no parameters
 * - Removed trailing semicolons after function definitions
 */

#include "avrcp.h"

static uint16_t _cid = 0;
static bool _playing = false;
static uint8_t _volume = 0;

static void avrcp_volume_changed(uint8_t volume) {
  const btstack_audio_sink_t *audio = btstack_audio_sink_get_instance();
  if (audio) {
    audio->set_volume(volume);
  }
}

static void connection_handler(uint8_t packet_type, uint16_t channel,
                               uint8_t *packet, uint16_t size) {
  UNUSED(channel);
  UNUSED(size);

  uint16_t cid;
  uint8_t status;

  if (packet_type != HCI_EVENT_PACKET) {
    return;
  }
  if (hci_event_packet_get_type(packet) != HCI_EVENT_AVRCP_META) {
    return;
  }

  switch (packet[2]) {
  case AVRCP_SUBEVENT_CONNECTION_ESTABLISHED:
    cid = avrcp_subevent_connection_established_get_avrcp_cid(packet);
    status = avrcp_subevent_connection_established_get_status(packet);
    if (status != ERROR_CODE_SUCCESS) {
      _cid = 0;
      return;
    }

    _cid = cid;

    avrcp_target_support_event(cid, AVRCP_NOTIFICATION_EVENT_VOLUME_CHANGED);
    avrcp_target_support_event(cid,
                               AVRCP_NOTIFICATION_EVENT_BATT_STATUS_CHANGED);
    avrcp_target_battery_status_changed(cid, AVRCP_BATTERY_STATUS_EXTERNAL);

    // Query supported events
    avrcp_controller_get_supported_events(cid);
    return;

  case AVRCP_SUBEVENT_CONNECTION_RELEASED:
    _cid = 0;
    return;

  default:
    break;
  }
}

static void controller_handler(uint8_t packet_type, uint16_t channel,
                               uint8_t *packet, uint16_t size) {
  UNUSED(channel);
  UNUSED(size);

  uint8_t play_status;

  if (packet_type != HCI_EVENT_PACKET) {
    return;
  }
  if (hci_event_packet_get_type(packet) != HCI_EVENT_AVRCP_META) {
    return;
  }
  if (_cid == 0) {
    return;
  }

  switch (packet[2]) {
  case AVRCP_SUBEVENT_GET_CAPABILITY_EVENT_ID_DONE:
    // Automatically enable notifications
    avrcp_controller_enable_notification(
        _cid, AVRCP_NOTIFICATION_EVENT_PLAYBACK_STATUS_CHANGED);
    avrcp_controller_enable_notification(
        _cid, AVRCP_NOTIFICATION_EVENT_NOW_PLAYING_CONTENT_CHANGED);
    avrcp_controller_enable_notification(
        _cid, AVRCP_NOTIFICATION_EVENT_TRACK_CHANGED);
    break;

  case AVRCP_SUBEVENT_NOTIFICATION_PLAYBACK_STATUS_CHANGED:
    play_status =
        avrcp_subevent_notification_playback_status_changed_get_play_status(
            packet);
    switch (play_status) {
    case AVRCP_PLAYBACK_STATUS_PLAYING:
      _playing = true;
      break;
    default:
      _playing = false;
      break;
    }
    break;

  default:
    break;
  }
}

static void target_handler(uint8_t packet_type, uint16_t channel,
                           uint8_t *packet, uint16_t size) {
  UNUSED(channel);
  UNUSED(size);

  if (packet_type != HCI_EVENT_PACKET) {
    return;
  }
  if (hci_event_packet_get_type(packet) != HCI_EVENT_AVRCP_META) {
    return;
  }

  switch (packet[2]) {
  case AVRCP_SUBEVENT_NOTIFICATION_VOLUME_CHANGED:
    _volume =
        avrcp_subevent_notification_volume_changed_get_absolute_volume(packet);
    avrcp_volume_changed(_volume);
    break;

  default:
    break;
  }
}

void avrcp_begin(void) {
  avrcp_init();
  avrcp_controller_init();
  avrcp_target_init();

  avrcp_register_packet_handler(connection_handler);
  avrcp_controller_register_packet_handler(controller_handler);
  avrcp_target_register_packet_handler(target_handler);
}

uint8_t avrcp_get_volume(void) { return _volume; }

bool avrcp_is_connected(void) { return _cid != 0; }

bool avrcp_is_playing(void) { return _playing; }