/**
 * @file            bt.c
 * @brief           Bluetooth stack initialization and event handling for
 *                  Classic BT and BLE dual-mode operation
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
 * - Added explicit (void) to functions with no parameters
 * - Added once-guard to bt_begin() to prevent double initialization
 * - Added BLE advertising and scan response support (dual-mode)
 * - Added SDP, SM (Security Manager) and GATT service initialization
 * - Added debug logging for Classic BT connection request and complete events
 * - Added startup logging of local BD address
 * - Added automatic classic audio reconnect on BLE connect, with the peer
 *   address persisted in the pico-kvstore (bt_reconnect_classic /
 *   bt_classic_connected)
 */

#include "bt.h"
#include "a2dp.h"
#include "avrcp.h"
#include "gatt_service.h"
#include "kvstore.h"
#include "l2cap.h"
#include "ota.h"
#include "sdp.h"
#include <btstack_event.h>
#include <btstack_run_loop.h>
#include <hci.h>
#include <memory.h>
#include <stdio.h>

static bool _is_up = false;
static bd_addr_t _local_addr = {0};
static bt_on_up_cb_t _cb = 0;
static void *_data = 0;
static const char *_name = 0;
static const char *_pin = 0;
static btstack_packet_callback_registration_t _hci_registration;

// Last Classic (BR/EDR) peer — persisted in the key-value store so the
// A2DP audio link can be re-established after a reboot once BLE connects
#define KV_KEY_CLASSIC_PEER "classic_peer"
static volatile uint16_t _classic_con_handle = HCI_CON_HANDLE_INVALID;
static bool _classic_peer_known = false;
static bool _reconnect_pending = false;
// Set while an OTA firmware update is in progress: the A2DP stream and the
// BLE transfer share one radio, and both at once starve the BLE connection
static bool _classic_suspended = false;

static void update_classic_status(void) {
  uint8_t status = _classic_peer_known ? CLASSIC_STATUS_PEER_KNOWN : 0;
  if (_classic_con_handle != HCI_CON_HANDLE_INVALID) {
    status |= CLASSIC_STATUS_CONNECTED;
  }
  gatt_service_set_classic_status(status);
}

// General Discoverable, BR/EDR supported (dual-mode — must NOT be 0x06)
#define APP_AD_FLAGS 0x02

// Advertising payload: flags + service UUID only (no name — name goes in scan
// response)
static uint8_t adv_data[] = {
    0x02,
    BLUETOOTH_DATA_TYPE_FLAGS,
    APP_AD_FLAGS,
    0x03,
    BLUETOOTH_DATA_TYPE_COMPLETE_LIST_OF_16_BIT_SERVICE_CLASS_UUIDS,
    0x10,
    0xFF,
};
static const uint8_t adv_data_len = sizeof(adv_data);

// Scan response: built at runtime from _name so BLE name matches Classic BT
// name
static uint8_t scan_resp_data[31];
static uint8_t scan_resp_data_len = 0;

static void packet_handler(uint8_t packet_type, uint16_t channel,
                           uint8_t *packet, uint16_t size) {
  UNUSED(size);
  UNUSED(channel);

  bd_addr_t address;

  if (packet_type != HCI_EVENT_PACKET)
    return;

  switch (hci_event_packet_get_type(packet)) {
  case BTSTACK_EVENT_STATE:
    if (btstack_event_state_get_state(packet) != HCI_STATE_WORKING)
      return;

    gap_local_bd_addr(_local_addr);
    printf("[bt] stack up, addr %02x:%02x:%02x:%02x:%02x:%02x\n",
           _local_addr[0], _local_addr[1], _local_addr[2], _local_addr[3],
           _local_addr[4], _local_addr[5]);

    // Build scan response with actual device name
    {
      uint8_t name_len = (uint8_t)strlen(_name);
      if (name_len > 29)
        name_len = 29;
      scan_resp_data[0] = name_len + 1;
      scan_resp_data[1] = BLUETOOTH_DATA_TYPE_COMPLETE_LOCAL_NAME;
      memcpy(&scan_resp_data[2], _name, name_len);
      scan_resp_data_len = name_len + 2;
      gap_scan_response_set_data(scan_resp_data_len, scan_resp_data);
    }

    // BLE advertisements
    {
      uint16_t adv_int_min = 800;
      uint16_t adv_int_max = 800;
      uint8_t adv_type = 0;
      bd_addr_t null_addr;
      memset(null_addr, 0, 6);
      gap_advertisements_set_params(adv_int_min, adv_int_max, adv_type, 0,
                                    null_addr, 0x07, 0x00);
      assert(adv_data_len <= 31);
      gap_advertisements_set_data(adv_data_len, (uint8_t *)adv_data);
      gap_advertisements_enable(1);
      gap_connectable_control(1);
    }

    gatt_service_start_timer();
    // Report whether a classic audio peer is stored (survives reboots)
    {
      bd_addr_t stored;
      size_t value_size = 0;
      _classic_peer_known =
          (kvs_get(KV_KEY_CLASSIC_PEER, stored, sizeof(stored), &value_size) ==
               KVSTORE_SUCCESS &&
           value_size >= sizeof(bd_addr_t));
    }
    update_classic_status();
    _is_up = true;
    if (_cb)
      (*_cb)(_data);
    break;

  case HCI_EVENT_CONNECTION_REQUEST:
    hci_event_connection_request_get_bd_addr(packet, address);
    if (_classic_suspended) {
      // The phone may auto-reconnect classic audio right after the update
      // dropped the link — reject it until the update finishes
      printf("[bt] rejecting classic connection during firmware update\n");
      hci_send_cmd(&hci_reject_connection_request, address,
                   ERROR_CODE_CONNECTION_REJECTED_DUE_TO_LIMITED_RESOURCES);
    } else {
      printf("[bt] Classic connection request\n");
    }
    break;

  case HCI_EVENT_CONNECTION_COMPLETE: {
    printf("[bt] Classic connection complete, status=0x%02x\n",
           hci_event_connection_complete_get_status(packet));
    hci_event_connection_complete_get_bd_addr(packet, address);
    _reconnect_pending = false;
    if (hci_event_connection_complete_get_status(packet) == ERROR_CODE_SUCCESS) {
      _classic_con_handle =
          hci_event_connection_complete_get_connection_handle(packet);
      // Persist the peer address so the classic audio link can be restored
      // after a reboot (kv-store survives the watchdog reset)
      int rc = kvs_set(KV_KEY_CLASSIC_PEER, address, sizeof(bd_addr_t));
      printf("[bt] classic peer %s stored (%s)\n", bd_addr_to_str(address),
             rc == KVSTORE_SUCCESS ? "ok" : kvs_strerror(rc));
      if (rc == KVSTORE_SUCCESS) {
        _classic_peer_known = true;
      }
      update_classic_status();
    }
    break;
  }

  case HCI_EVENT_DISCONNECTION_COMPLETE: {
    uint16_t handle =
        hci_event_disconnection_complete_get_connection_handle(packet);
    if (handle == _classic_con_handle) {
      _classic_con_handle = HCI_CON_HANDLE_INVALID;
      _reconnect_pending = false;
      printf("[bt] Classic connection released\n");
      update_classic_status();
    }
    break;
  }

  case HCI_EVENT_PIN_CODE_REQUEST:
    hci_event_pin_code_request_get_bd_addr(packet, address);
    gap_pin_code_response(address, _pin);
    break;

  default:
    break;
  }
}

void bt_begin(const char *name, const char *pin, bt_on_up_cb_t cb, void *data) {
  static bool _begun = false;
  if (_begun)
    return;
  _begun = true;

  _name = name ? name : "Pico 00:00:00:00:00:00";
  _pin = pin ? pin : "0000";
  _data = data;
  _cb = cb;

  l2cap_init();
  sdp_init();
  a2dp_sink_begin();
  avrcp_begin();
  sdp_begin();
  sm_init();
  sm_set_io_capabilities(IO_CAPABILITY_NO_INPUT_NO_OUTPUT);
  sm_set_authentication_requirements(0);
  gatt_service_init();
  ota_init();

  gap_set_local_name(_name); // Classic BT name
  gap_discoverable_control(1);
  gap_set_class_of_device(0x200414);
  gap_set_default_link_policy_settings(LM_LINK_POLICY_ENABLE_ROLE_SWITCH |
                                       LM_LINK_POLICY_ENABLE_SNIFF_MODE);
  gap_set_allow_role_switch(true);

  _hci_registration.callback = &packet_handler;
  hci_add_event_handler(&_hci_registration);
}

void bt_run(void) {
  hci_power_control(HCI_POWER_ON);
  btstack_run_loop_execute();
}

void bt_reconnect_classic(void) {
  if (!_is_up || _reconnect_pending)
    return;
  if (_classic_suspended)
    return; // OTA update in progress — classic link stays down
  if (_classic_con_handle != HCI_CON_HANDLE_INVALID)
    return; // Classic link already up

  // Look up the classic audio peer in persistent storage
  bd_addr_t peer;
  size_t value_size = 0;
  int rc = kvs_get(KV_KEY_CLASSIC_PEER, peer, sizeof(peer), &value_size);
  if (rc != KVSTORE_SUCCESS || value_size < sizeof(bd_addr_t)) {
    printf("[bt] no classic peer in storage (%s)\n",
           rc == KVSTORE_SUCCESS ? "empty" : kvs_strerror(rc));
    return;
  }

  uint8_t status = a2dp_sink_connect_peer(peer);
  printf("[bt] classic audio reconnect to %s -> status=0x%02x\n",
         bd_addr_to_str(peer), status);
  _reconnect_pending = (status == ERROR_CODE_SUCCESS);
}

void bt_set_classic_suspended(bool suspend) {
  _classic_suspended = suspend;
  if (suspend && _classic_con_handle != HCI_CON_HANDLE_INVALID) {
    printf("[bt] classic link suspended for firmware update\n");
    gap_disconnect(_classic_con_handle);
  }
}

bool bt_classic_connected(void) {
  return _classic_con_handle != HCI_CON_HANDLE_INVALID;
}

bool bt_up(void) { return _is_up; }

void bt_addr(bd_addr_t local_addr) {
  memcpy(local_addr, _local_addr, sizeof(bd_addr_t));
}