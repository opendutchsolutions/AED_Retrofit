/**
 * @file            main.c
 * @brief           Application entry point handling hardware initialization,
 *                  CYW43 driver setup and Bluetooth stack startup
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

#include "a2dp.h"
#include "board_config.h"
#include "bt.h"
#include "gatt_service.h"
#include "hardware/clocks.h"
#include "hardware/watchdog.h"
#include "ota.h"
#include "pico/cyw43_arch.h"
#include "pico/stdlib.h"
#include <btstack_run_loop.h>
#include <stdio.h>
#include <string.h>
#ifdef LIB_PICO_STDIO_USB
#include "pico/stdio_usb.h"
#endif
#include "kvstore.h"

void fatal(void) {
  watchdog_enable(1000, true); // Reboot in 1s

#ifdef RUN_PIN
  unsigned count = 0;
#endif

  // Blink until reboot
  while (true) {
    gpio_put(STATUS_LED_R_PIN, 0);
    cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, true);
    sleep_ms(20);
    gpio_put(STATUS_LED_R_PIN, 1);
    cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, false);
    sleep_ms(80);

#ifdef RUN_PIN
    if (++count >= 5) {
      // Pull run pin low to reset the pico
      gpio_init(RUN_PIN);
      gpio_set_dir(RUN_PIN, GPIO_OUT);
      gpio_put(RUN_PIN, (count & 1) ? false : true);
    }
#endif
  }
}

static void on_bt_up(void *context) { printf("Bluetooth stack is up\n"); }

// --- Serial self-test commands (used to test the OTA flash path without
// --- a BLE transport): "otatest <bytes>" and "otaapply <bytes>"
static char _cmd_buf[64];
static uint8_t _cmd_len = 0;
static btstack_timer_source_t _serial_timer;

static uint32_t parse_num(const char *s) {
  uint32_t v = 0;
  while (*s >= '0' && *s <= '9') {
    v = v * 10u + (uint32_t)(*s - '0');
    s++;
  }
  return v;
}

static void serial_timer_cb(btstack_timer_source_t *ts) {
  int c;
  while ((c = getchar_timeout_us(0)) >= 0) {
    if (c == '\n' || c == '\r') {
      if (_cmd_len > 0) {
        _cmd_buf[_cmd_len] = '\0';
        // Hosts with tty echo enabled feed our own output back into RX;
        // ignore lines that are clearly our own log output.
        if (_cmd_buf[0] == '[' ||
            strncmp(_cmd_buf, "commands:", 9) == 0 ||
            strncmp(_cmd_buf, "alive ", 6) == 0) {
          _cmd_len = 0;
          continue;
        }
        uint32_t n = 0;
        if (strncmp(_cmd_buf, "otatest ", 8) == 0 &&
            (n = parse_num(_cmd_buf + 8)) > 0) {
          ota_selftest(n);
        } else if (strncmp(_cmd_buf, "otaapply ", 9) == 0 &&
                   (n = parse_num(_cmd_buf + 9)) > 0) {
          ota_apply_selftest(n);
        } else if (strncmp(_cmd_buf, "pcmtest ", 8) == 0 &&
                   (n = parse_num(_cmd_buf + 8)) > 0) {
          a2dp_pcm_analyze_start(n);
        } else if (strcmp(_cmd_buf, "pcmreport") == 0) {
          a2dp_pcm_analyze_report();
        } else {
          printf("commands: got \"%s\" — otatest <b>, otaapply <b>, "
                 "pcmtest <b>, pcmreport\n", _cmd_buf);
        }
        _cmd_len = 0;
      }
    } else if (_cmd_len < sizeof(_cmd_buf) - 1) {
      _cmd_buf[_cmd_len++] = (char)c;
    } else {
      _cmd_len = 0; // overflowed — drop the line
    }
  }
  btstack_run_loop_set_timer(ts, 100);
  btstack_run_loop_add_timer(ts);
  // Run-loop heartbeat every 2 s: if this stops, the loop is stuck
  static uint32_t alive = 0;
  if (++alive % 20 == 0) {
    printf("alive %u\n", alive / 20);
  }
}

static void serial_commands_init(void) {
  btstack_run_loop_set_timer(&_serial_timer, 100);
  btstack_run_loop_set_timer_handler(&_serial_timer, serial_timer_cb);
  btstack_run_loop_add_timer(&_serial_timer);
}


static void led_pins_init(void) {
  gpio_init(STATUS_LED_B_PIN);
  gpio_init(STATUS_LED_G_PIN);
  gpio_init(STATUS_LED_R_PIN);
  gpio_set_dir(STATUS_LED_B_PIN, GPIO_OUT);
  gpio_set_dir(STATUS_LED_G_PIN, GPIO_OUT);
  gpio_set_dir(STATUS_LED_R_PIN, GPIO_OUT);
  gpio_set_drive_strength(STATUS_LED_B_PIN, GPIO_DRIVE_STRENGTH_2MA);
  gpio_set_drive_strength(STATUS_LED_G_PIN, GPIO_DRIVE_STRENGTH_2MA);
  gpio_set_drive_strength(STATUS_LED_R_PIN, GPIO_DRIVE_STRENGTH_2MA);
  gpio_set_slew_rate(STATUS_LED_B_PIN, GPIO_SLEW_RATE_SLOW);
  gpio_set_slew_rate(STATUS_LED_G_PIN, GPIO_SLEW_RATE_SLOW);
  gpio_set_slew_rate(STATUS_LED_R_PIN, GPIO_SLEW_RATE_SLOW);
  gpio_put(STATUS_LED_R_PIN, 1);
  gpio_put(STATUS_LED_G_PIN, 1);
  gpio_put(STATUS_LED_B_PIN, 1);
}

int main(void) {
  stdio_init_all();

#ifdef LIB_PICO_STDIO_USB
  // The USB CDC stack drops output until the host opens the port, which
  // takes ~1s after a reset. Wait briefly so boot logs are not lost.
  absolute_time_t log_deadline = make_timeout_time_ms(2000);
  while (!stdio_usb_connected() && time_reached(log_deadline) == false) {
    sleep_ms(10);
  }
#endif
  printf("AED-Simulator firmware v%s\n", FW_VERSION);

  // Initialize CYW43 driver architecture
  if (cyw43_arch_init()) {
    printf("Failed to init cyw43_arch\n");
    fatal();
    return -1;
  }
  cyw43_wifi_set_up(&cyw43_state, CYW43_ITF_STA, false,
                    CYW43_COUNTRY_WORLDWIDE);
  // Persistent key-value store — holds the classic audio peer address
  // used to re-establish the A2DP link when BLE (re)connects
  if (!kvs_init()) {
    printf("kvs_init failed\n");
  }
  // Apply a downloaded OTA image over the main firmware, if any
  ota_apply_check_and_run();
  bt_begin(BT_NAME, BT_PIN, on_bt_up, NULL);
  led_pins_init();

  printf("Setup done\n");
  serial_commands_init();

  bt_run();

  fatal();
  return -2;
}