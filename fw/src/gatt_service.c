/**
 * @file            gatt_service.c
 * @brief           GATT service exposing LED control and button state
 *                  over BLE for AED retrofit board peripherals
 *
 * @par
 * Copyright 2026 (C) OpenDutchSolutions Foundation
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
 * Author:          Hoog-V
 */

#include "gatt_service.h"
#include "board_config.h"

#include <ble/att_db_util.h>
#include <ble/att_server.h>
#include <btstack.h>
#include <hardware/gpio.h>
#include <stdio.h>

static const uint8_t LED_PINS[] = {
    SHOCK_LED_PIN,     ON_OFF_LED_PIN,          INFO_LED_PIN,
    HANDS_OFF_LED_PIN, LOW_BELLY_INDICATOR_PIN, BREAST_INDICATOR_PIN,
    BUZZER_PIN};
#define NUM_LEDS ((uint8_t)(sizeof(LED_PINS) / sizeof(LED_PINS[0])))

static const uint8_t BTN_PINS[] = {SHOCK_BUTTON_PIN, ON_OFF_BUTTON_PIN,
                                   INFO_BUTTON_PIN, CARD_SLOT_PIN,
                                   PADS_INSERTED_PIN};
#define NUM_BUTTONS ((uint8_t)(sizeof(BTN_PINS) / sizeof(BTN_PINS[0])))

static volatile uint8_t _button_mask = 0;
static volatile uint8_t _led_mask = 0;
static volatile uint16_t _conn_handle = HCI_CON_HANDLE_INVALID;
static volatile uint16_t _btn_notify_en = 0;

static uint16_t _handle_buttons_value = 0;
static uint16_t _handle_buttons_cccd = 0;
static uint16_t _handle_leds_value = 0;
static uint16_t _handle_service_start = 0;
static uint16_t _handle_service_end = 0;

static btstack_packet_callback_registration_t _hci_cb_reg;
static att_service_handler_t _service_handler;
static btstack_timer_source_t _btn_timer;
static btstack_timer_source_t _conn_param_timer;
static bool _timers_running = false;
static volatile hci_con_handle_t _pending_param_handle = HCI_CON_HANDLE_INVALID;

static btstack_context_callback_registration_t _notify_reg;

static void conn_param_timer_cb(btstack_timer_source_t *ts) {
  UNUSED(ts);
  if (_pending_param_handle != HCI_CON_HANDLE_INVALID) {
    gap_request_connection_parameter_update(_pending_param_handle, 24, 40, 0,
                                            600);
    _pending_param_handle = HCI_CON_HANDLE_INVALID;
  }
}

static void apply_leds(uint8_t mask) {
  for (uint8_t i = 0; i < NUM_LEDS; i++) {
    gpio_put(LED_PINS[i], (mask >> i) & 1u);
  }
}

static uint8_t sample_buttons(void) {
  uint8_t mask = 0;
  for (uint8_t i = 0; i < NUM_BUTTONS; i++) {
    // Active-low with pull-up: unpressed = high, pressed = low
    if (!gpio_get(BTN_PINS[i])) {
      mask |= (1u << i);
    }
  }
  return mask;
}

static void do_notify(void *context) {
  UNUSED(context);
  uint8_t mask = _button_mask; // Local copy avoids volatile warning
  att_server_notify(_conn_handle, _handle_buttons_value, &mask, 1);
}

static void btn_timer_cb(btstack_timer_source_t *ts) {
  uint8_t current = sample_buttons();
  if (current != _button_mask) {
    _button_mask = current;
    printf("[gatt] buttons -> 0x%02x\n", _button_mask);
    if (_conn_handle != HCI_CON_HANDLE_INVALID &&
        (_btn_notify_en &
         GATT_CLIENT_CHARACTERISTICS_CONFIGURATION_NOTIFICATION)) {
      // Request a send slot — do_notify fires when stack is ready
      _notify_reg.callback = &do_notify;
      _notify_reg.context = NULL;
      att_server_request_to_send_notification(&_notify_reg, _conn_handle);
    }
  }
  btstack_run_loop_set_timer(ts, 20);
  btstack_run_loop_add_timer(ts);
}

static uint16_t service_read_cb(hci_con_handle_t con_handle,
                                uint16_t attribute_handle, uint16_t offset,
                                uint8_t *buffer, uint16_t buffer_size) {
  UNUSED(con_handle);
  UNUSED(offset);
  UNUSED(buffer_size);

  if (attribute_handle == _handle_buttons_value) {
    if (buffer) {
      buffer[0] = _button_mask;
    }
    return 1;
  }
  if (attribute_handle == _handle_leds_value) {
    if (buffer) {
      buffer[0] = _led_mask;
    }
    return 1;
  }
  return 0;
}

static int service_write_cb(hci_con_handle_t con_handle,
                            uint16_t attribute_handle,
                            uint16_t transaction_mode, uint16_t offset,
                            uint8_t *buffer, uint16_t buffer_size) {
  UNUSED(con_handle);
  UNUSED(transaction_mode);
  UNUSED(offset);

  if (attribute_handle == _handle_buttons_cccd) {
    if (buffer_size >= 2) {
      _btn_notify_en = little_endian_read_16(buffer, 0);
    }
    printf("[gatt] button notify %s\n",
           _btn_notify_en ? "enabled" : "disabled");
    return 0;
  }
  if (attribute_handle == _handle_leds_value) {
    if (buffer_size >= 1) {
      _led_mask = buffer[0] & ((1u << NUM_LEDS) - 1u);
      apply_leds(_led_mask);
      printf("[gatt] LEDs -> 0x%02x\n", _led_mask);
    }
    return 0;
  }
  return 0;
}

static void hci_packet_handler(uint8_t packet_type, uint16_t channel,
                               uint8_t *packet, uint16_t size) {
  UNUSED(channel);
  UNUSED(size);

  if (packet_type != HCI_EVENT_PACKET) {
    return;
  }

  switch (hci_event_packet_get_type(packet)) {
  case HCI_EVENT_LE_META:
    if (hci_event_le_meta_get_subevent_code(packet) ==
        HCI_SUBEVENT_LE_CONNECTION_COMPLETE) {
      _conn_handle =
          hci_subevent_le_connection_complete_get_connection_handle(packet);
      printf("[gatt] BLE connected handle=0x%04x\n", _conn_handle);
      // Delay param update — immediate request causes disconnect on dual-mode
      _pending_param_handle = _conn_handle;
      btstack_run_loop_set_timer(&_conn_param_timer, 500);
      btstack_run_loop_set_timer_handler(&_conn_param_timer,
                                         conn_param_timer_cb);
      btstack_run_loop_add_timer(&_conn_param_timer);
    }
    break;

  case HCI_EVENT_DISCONNECTION_COMPLETE:
    _conn_handle = HCI_CON_HANDLE_INVALID;
    _btn_notify_en = 0;
    printf("[gatt] BLE disconnected\n");
    break;

  default:
    break;
  }
}

void gatt_service_init(void) {
  // Initialize LEDs as outputs, all off
  for (uint8_t i = 0; i < NUM_LEDS; i++) {
    gpio_init(LED_PINS[i]);
    gpio_set_dir(LED_PINS[i], GPIO_OUT);
    gpio_put(LED_PINS[i], 0);
    gpio_set_drive_strength(LED_PINS[i], GPIO_DRIVE_STRENGTH_2MA);
    gpio_set_slew_rate(LED_PINS[i], GPIO_SLEW_RATE_SLOW);
  }
  gpio_init(BUZZER_PIN);
  gpio_set_dir(BUZZER_PIN, GPIO_OUT);
  gpio_put(BUZZER_PIN, 0);
  gpio_set_drive_strength(BUZZER_PIN, GPIO_DRIVE_STRENGTH_8MA);
  gpio_set_slew_rate(BUZZER_PIN, GPIO_SLEW_RATE_SLOW);

  // Initialize buttons as inputs with pull-up
  for (uint8_t i = 0; i < NUM_BUTTONS; i++) {
    gpio_init(BTN_PINS[i]);
    gpio_set_dir(BTN_PINS[i], GPIO_IN);
    gpio_pull_up(BTN_PINS[i]);
  }

  // Build ATT database
  att_db_util_init();
  _handle_service_start = att_db_util_add_service_uuid16(0xFF10);

  _handle_buttons_value = att_db_util_add_characteristic_uuid16(
      0xFF11, ATT_PROPERTY_READ | ATT_PROPERTY_NOTIFY | ATT_PROPERTY_DYNAMIC,
      ATT_SECURITY_NONE, ATT_SECURITY_NONE, NULL, 0);
  _handle_buttons_cccd = _handle_buttons_value + 1;

  _handle_leds_value = att_db_util_add_characteristic_uuid16(
      0xFF12,
      ATT_PROPERTY_READ | ATT_PROPERTY_WRITE |
          ATT_PROPERTY_WRITE_WITHOUT_RESPONSE | ATT_PROPERTY_DYNAMIC,
      ATT_SECURITY_NONE, ATT_SECURITY_NONE, NULL, 0);

  _handle_service_end = _handle_leds_value;

  // Register ATT server
  att_server_init(att_db_util_get_address(), NULL, NULL);
  _service_handler.start_handle = _handle_service_start;
  _service_handler.end_handle = _handle_service_end;
  _service_handler.read_callback = &service_read_cb;
  _service_handler.write_callback = &service_write_cb;
  att_server_register_service_handler(&_service_handler);

  // Register HCI connect/disconnect handler
  _hci_cb_reg.callback = &hci_packet_handler;
  hci_add_event_handler(&_hci_cb_reg);
}

void gatt_service_start_timer(void) {
  if (_timers_running) {
    return;
  }
  _timers_running = true;

  // Button poll every 20ms
  btstack_run_loop_set_timer(&_btn_timer, 20);
  btstack_run_loop_set_timer_handler(&_btn_timer, btn_timer_cb);
  btstack_run_loop_add_timer(&_btn_timer);

  printf("[gatt] started (btn=%d cccd=%d led=%d)\n", _handle_buttons_value,
         _handle_buttons_cccd, _handle_leds_value);
}

uint8_t gatt_service_get_leds(void) { return _led_mask; }