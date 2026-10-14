/**
 * @file            ota.c
 * @brief           BLE OTA GATT service (0xFF20) staging an incoming
 *                  firmware image in the OTA slot; the image is verified
 *                  (CRC32 + P-256 ECDSA) and applied at boot by ota_apply.c
 *
 * Protocol (little-endian):
 *   0xFF21 control/status — write commands, read + notify status:
 *     write [0x01][size:u32][crc32:u32]  start transfer
 *     write [0x04][sig:64]              signature (raw r||s) after the data
 *     write [0x02]                      finish (verify, store, reboot)
 *     write [0x03]                     abort
 *     status: [state:u8][progress:u32][error:u8]
 *   0xFF22 data — write without response, image bytes in order.
 *     Erased/programmed one 4KB sector at a time via ROM flash ops.
 *
 * This file is part of the AED_RETROFIT project
 * SPDX-License-Identifier: EUPL-1.2
 */

#include "ota.h"

#include <ble/att_db_util.h>
#include <ble/att_server.h>
#include <btstack.h>
#include <hardware/flash.h>
#include <hardware/watchdog.h>
#include <pico.h>
#include <pico/bootrom.h>
#include <pico/flash.h>
#include <pico/sha256.h>
#include <pico/time.h>
#include <stdio.h>
#include <string.h>

#include "boot/picoboot.h"
#include "bt.h"
#include "kvstore.h"
#include "ota_pub_key.h"

// Declared directly instead of including uECC.h: micro-ecc's asm-labelled
// declarations confuse the Thumb linker. P-256, 64-byte key/signature.
extern int uECC_verify(const uint8_t public_key[64], const uint8_t hash[32],
                       const uint8_t signature[64]);

#define OTA_SERVICE_UUID 0xFF20
#define OTA_CTRL_UUID 0xFF21
#define OTA_DATA_UUID 0xFF22

#define KV_KEY_OTA_APPLY "ota_apply"
#define OTA_APPLY_MAGIC 0x4F544131u /* "OTA1" */

typedef struct {
  uint32_t magic;
  uint32_t size;
  uint32_t crc;
} ota_apply_record_t;

#define FLASH_SECTOR_SIZE_4K 4096u
#define FLASH_PAGE_SIZE_256 256u

typedef enum {
  OTA_IDLE = 0,
  OTA_RECEIVING = 1,
  OTA_VERIFYING = 2,
  OTA_READY = 3,
  OTA_ERROR = 4,
} ota_state_t;

typedef enum {
  OTA_ERR_NONE = 0,
  OTA_ERR_TOO_BIG = 1,
  OTA_ERR_OVERFLOW = 2,
  OTA_ERR_NOT_STARTED = 3,
  OTA_ERR_INCOMPLETE = 4,
  OTA_ERR_CRC = 5,
  OTA_ERR_FLASH = 6,
  OTA_ERR_NO_SIGNATURE = 7,
  OTA_ERR_BAD_SIGNATURE = 8,
} ota_error_t;

static ota_state_t _state = OTA_IDLE;
static ota_error_t _error = OTA_ERR_NONE;
static uint32_t _image_size = 0;
static uint32_t _image_crc = 0;
static uint32_t _received = 0;
static uint32_t _buf_fill = 0;
static uint32_t _sector_count = 0;
static bool _dry_run = false; // START flag bit0: count only, no flash
static uint32_t _staged_crc = 0; // image crc of the current/last transfer
static uint8_t _sector_buf[FLASH_SECTOR_SIZE_4K];
static uint8_t _signature[64];
static bool _have_signature = false;

static uint16_t _handle_service_start = 0;
static uint16_t _handle_ctrl_value = 0;
static uint16_t _handle_ctrl_cccd = 0;
static uint16_t _handle_data_value = 0;
static volatile uint16_t _conn_handle = HCI_CON_HANDLE_INVALID;
static volatile uint16_t _notify_en = 0;

static att_service_handler_t _service;
static btstack_packet_callback_registration_t _hci_cb_reg;
static btstack_context_callback_registration_t _notify_reg;
static btstack_timer_source_t _reboot_timer;

static uint32_t crc32(const uint8_t *data, uint32_t len) {
  uint32_t crc = 0xFFFFFFFFu;
  for (uint32_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (int k = 0; k < 8; k++) {
      crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
    }
  }
  return ~crc;
}

#define OTA_STATUS_LEN 10
static void status_bytes(uint8_t *out) {
  out[0] = (uint8_t)_state;
  out[1] = _received & 0xFF;
  out[2] = (_received >> 8) & 0xFF;
  out[3] = (_received >> 16) & 0xFF;
  out[4] = (_received >> 24) & 0xFF;
  out[5] = (uint8_t)_error;
  out[6] = _staged_crc & 0xFF;
  out[7] = (_staged_crc >> 8) & 0xFF;
  out[8] = (_staged_crc >> 16) & 0xFF;
  out[9] = (_staged_crc >> 24) & 0xFF;
}

static void do_status_notify(void *context) {
  UNUSED(context);
  uint8_t status[6];
  status_bytes(status);
  att_server_notify(_conn_handle, _handle_ctrl_value, status, sizeof(status));
}

static void notify_status(void) {
  if (_conn_handle == HCI_CON_HANDLE_INVALID ||
      !(_notify_en & GATT_CLIENT_CHARACTERISTICS_CONFIGURATION_NOTIFICATION)) {
    return;
  }
  _notify_reg.callback = &do_status_notify;
  _notify_reg.context = NULL;
  att_server_request_to_send_notification(&_notify_reg, _conn_handle);
}

static void set_error(ota_error_t err) {
  _error = err;
  _state = OTA_ERROR;
  _received = 0;
  _buf_fill = 0;
  _have_signature = false;
  bt_set_classic_suspended(false); // failed update: back to normal operation
  notify_status();
}

static void reboot_timer_cb(btstack_timer_source_t *ts) {
  UNUSED(ts);
  printf("[ota] rebooting to apply the update\n");
  // Plain reset — the new image is applied at boot by ota_apply.c
  watchdog_reboot(0, 0, 0);
}

// SHA-256 over the staged image, verified against the P-256 signature.
static bool verify_signature(void) {
  if (!_have_signature) {
    return false;
  }
  pico_sha256_state_t sha;
  if (pico_sha256_start_blocking(&sha, SHA256_BIG_ENDIAN, false) != PICO_OK) {
    return false;
  }
  // Stream the staged image 4KB at a time (it lives in XIP flash)
  static uint8_t chunk[FLASH_SECTOR_SIZE_4K];
  for (uint32_t off = 0; off < _image_size; off += sizeof(chunk)) {
    uint32_t n = _image_size - off;
    if (n > sizeof(chunk)) {
      n = sizeof(chunk);
    }
    memcpy(chunk, (const uint8_t *)(OTA_STAGING_BASE + off), n);
    pico_sha256_update_blocking(&sha, chunk, n);
  }
  sha256_result_t hash;
  pico_sha256_finish(&sha, &hash);
  return uECC_verify(OTA_PUB_KEY, hash.bytes, _signature) == 1;
}

typedef struct {
  uint32_t offset;   // flash offset (XIP-relative) to write
  uint32_t buf_off;  // byte offset in _sector_buf to source the data from
} ota_flash_param_t;

static ota_flash_param_t _flush_param;

static void ota_erase_sector(void *param) {
  const ota_flash_param_t *p = param;
  flash_range_erase(p->offset, FLASH_SECTOR_SIZE_4K);
}

static void ota_program_page(void *param) {
  const ota_flash_param_t *p = param;
  flash_range_program(p->offset, _sector_buf + p->buf_off, FLASH_PAGE_SIZE_256);
}

// Erase + program one buffered sector of the staging area using
// flash_safe_execute (interrupt-safe, works during BLE).
static bool flush_sector(void) {
  _flush_param.offset = OTA_STAGING_BASE - XIP_BASE + _received;
  uint32_t t0 = time_us_32();
  int rc = flash_safe_execute(ota_erase_sector, &_flush_param, 100);
  if (rc != PICO_OK) {
    printf("[ota] erase failed: %d\n", rc);
    return false;
  }
  uint32_t t_erase = time_us_32() - t0;
  _flush_param.buf_off = 0;
  for (uint32_t off = 0; off < FLASH_SECTOR_SIZE_4K; off += FLASH_PAGE_SIZE_256) {
    _flush_param.offset = OTA_STAGING_BASE - XIP_BASE + _received + off;
    _flush_param.buf_off = off;
    rc = flash_safe_execute(ota_program_page, &_flush_param, 100);
    if (rc != PICO_OK) {
      printf("[ota] program failed: %d\n", rc);
      return false;
    }
  }
  _received += _buf_fill;
  _buf_fill = 0;
  _sector_count++;
  printf("[ota] sector %u flushed (erase %lu us, total %lu us, %u bytes in)\n",
         _sector_count, t_erase, time_us_32() - t0, _received);
  return true;
}

static void finish_transfer(void) {
  if (_state != OTA_RECEIVING) {
    set_error(OTA_ERR_NOT_STARTED);
    return;
  }
  if (_dry_run) {
    printf("[ota] dry run complete: %u bytes received\n", _received);
    _state = OTA_READY;
    notify_status();
    return; // no flash write, no verify, no reboot — diagnostic only
  }
  _state = OTA_VERIFYING;
  notify_status();

  if (_buf_fill > 0) {
    // Pad the last partial sector with erased-flash bytes
    memset(_sector_buf + _buf_fill, 0xFF, sizeof(_sector_buf) - _buf_fill);
    if (!flush_sector()) {
      set_error(OTA_ERR_FLASH);
      return;
    }
  }
  if (_received < _image_size + 64) {
    set_error(OTA_ERR_INCOMPLETE);
    return;
  }

  printf("[ota] verifying %u bytes\n", _image_size);
  // CRC covers the image only — not the 64 signature bytes riding the stream
  uint32_t crc = crc32((const uint8_t *)OTA_STAGING_BASE, _image_size);
  if (crc != _image_crc) {
    printf("[ota] crc mismatch (got 0x%08x want 0x%08x)\n", crc, _image_crc);
    set_error(OTA_ERR_CRC);
    return;
  }

  if (!verify_signature()) {
    printf("[ota] signature verification failed\n");
    set_error(_have_signature ? OTA_ERR_BAD_SIGNATURE : OTA_ERR_NO_SIGNATURE);
    return;
  }

  ota_apply_record_t rec = {
    .magic = OTA_APPLY_MAGIC,
    .size = _image_size, // image only — the 64 signature bytes are not flashed
    .crc = crc,
  };
  int rc = kvs_set(KV_KEY_OTA_APPLY, &rec, sizeof(rec));
  if (rc != KVSTORE_SUCCESS) {
    printf("[ota] could not store apply record: %s\n", kvs_strerror(rc));
    set_error(OTA_ERR_FLASH);
    return;
  }

  _state = OTA_READY;
  notify_status();
  // Give the notification time to go out, then reset
  btstack_run_loop_set_timer(&_reboot_timer, 500);
  btstack_run_loop_set_timer_handler(&_reboot_timer, reboot_timer_cb);
  btstack_run_loop_add_timer(&_reboot_timer);
}

static void handle_data(const uint8_t *buffer, uint16_t size) {
  static uint32_t _write_count = 0;
  _write_count++;
  if (_state != OTA_RECEIVING) {
    printf("[ota] data outside transfer ignored (write #%u, %u bytes)\n",
           _write_count, size);
    return; // ignore data outside a transfer
  }
  if (_dry_run) {
    _received += size; // diagnostic mode: count only, no flash
    return;
  }
  if (_write_count % 128 == 0) {
    printf("[ota] write #%u (%u bytes, %u in)\n", _write_count, size,
           _received + _buf_fill);
  }
  while (size > 0) {
    // Route bytes past the image into the signature buffer
    if (_received + _buf_fill >= _image_size) {
      uint32_t sig_off = (_received + _buf_fill) - _image_size;
      uint32_t sig_take = 64 - sig_off;
      if (sig_take > size) {
        sig_take = size;
      }
      if (sig_off + sig_take > 64) {
        set_error(OTA_ERR_OVERFLOW);
        return;
      }
      memcpy(_signature + sig_off, buffer, sig_take);
      if (sig_off + sig_take == 64) {
        _have_signature = true;
        printf("[ota] signature complete\n");
      }
      buffer += sig_take;
      size -= sig_take;
      // Account for the signature bytes in _received via _buf_fill
      // (they don't go to flash, but count toward the total)
      _received += sig_take;
      if (size == 0) break;
    }

    uint32_t space = sizeof(_sector_buf) - _buf_fill;
    uint32_t take = (size < space) ? size : space;
    if (take > _image_size - (_received + _buf_fill)) {
      take = _image_size - (_received + _buf_fill);
    }
    if (take == 0) break;
    memcpy(_sector_buf + _buf_fill, buffer, take);
    _buf_fill += take;
    buffer += take;
    size -= take;
    if (_received + _buf_fill > _image_size) {
      set_error(OTA_ERR_OVERFLOW);
      return;
    }
    if (_buf_fill == sizeof(_sector_buf)) {
      if (!flush_sector()) {
        set_error(OTA_ERR_FLASH);
        return;
      }
      notify_status();
    }
  }
}

static void handle_control(const uint8_t *buffer, uint16_t size) {
  if (size < 1) {
    return;
  }
  switch (buffer[0]) {
  case 0x01: { // START [total_size:u32][crc32:u32][img_size:u32][flags:u32][offset:u32]
    // total_size = image bytes + 64-byte signature appended at the end;
    // flags bit0 = dry run (count bytes only, no flash writes);
    // offset = resume point (4 kB aligned) — sectors below it were
    // already staged by a previous interrupted transfer
    if (size < 13) {
      return;
    }
    uint32_t flags = (size >= 17) ? little_endian_read_32(buffer, 13) : 0;
    uint32_t resume_off = (size >= 21) ? little_endian_read_32(buffer, 17) : 0;
    uint32_t total_size = little_endian_read_32(buffer, 1);
    uint32_t total_crc = little_endian_read_32(buffer, 5);
    uint32_t img_size = little_endian_read_32(buffer, 9);
    if (img_size == 0 || img_size > OTA_STAGING_SIZE ||
        total_size != img_size + 64 || total_size > OTA_STAGING_SIZE + 64 ||
        resume_off > img_size || (resume_off % FLASH_SECTOR_SIZE_4K) != 0) {
      set_error(OTA_ERR_TOO_BIG);
      return;
    }
    _image_size = img_size;
    _image_crc = total_crc; // CRC covers image bytes only (0..img_size)
    _staged_crc = total_crc; // resume state survives disconnects
    _received = resume_off;
    _buf_fill = 0;
    _sector_count = resume_off / FLASH_SECTOR_SIZE_4K;
    _dry_run = (flags & 1u) != 0;
    _have_signature = false;
    _error = OTA_ERR_NONE;
    _state = OTA_RECEIVING;
    // The A2DP stream and the BLE transfer share one radio — suspend the
    // classic link for the duration of the update or the BLE link drops
    bt_set_classic_suspended(true);
    printf("[ota] start: %u image + 64 sig bytes, crc 0x%08x\n", img_size, total_crc);
    notify_status();
    break;
  }
  case 0x02: // FINISH
    finish_transfer();
    break;
  case 0x03: // ABORT
    _state = OTA_IDLE;
    _error = OTA_ERR_NONE;
    _received = 0;
    _buf_fill = 0;
    _have_signature = false;
    bt_set_classic_suspended(false);
    notify_status();
    break;
  case 0x04: // SIGNATURE — deprecated, signature now rides the data stream
    break;
  default:
    break;
  }
}

static uint16_t ota_read_cb(hci_con_handle_t con_handle, uint16_t attr,
                            uint16_t offset, uint8_t *buffer,
                            uint16_t buffer_size) {
  UNUSED(con_handle);
  if (attr == _handle_ctrl_value) {
    if (buffer) {
      uint8_t status[OTA_STATUS_LEN];
      status_bytes(status);
      uint16_t take =
          (buffer_size < sizeof(status)) ? buffer_size : sizeof(status);
      memcpy(buffer, status, take);
    }
    return OTA_STATUS_LEN;
  }
  return 0;
}

static int ota_write_cb(hci_con_handle_t con_handle, uint16_t attr,
                        uint16_t transaction_mode, uint16_t offset,
                        uint8_t *buffer, uint16_t buffer_size) {
  UNUSED(con_handle);
  UNUSED(transaction_mode);
  UNUSED(offset);

  if (attr == _handle_ctrl_cccd) {
    if (buffer_size >= 2) {
      _notify_en = little_endian_read_16(buffer, 0);
      printf("[ota] status notify %s\n", _notify_en ? "enabled" : "disabled");
    }
    return 0;
  }
  if (attr == _handle_ctrl_value) {
    handle_control(buffer, buffer_size);
    return 0;
  }
  if (attr == _handle_data_value) {
    handle_data(buffer, buffer_size);
    return 0;
  }
  return 0;
}

static void ota_hci_handler(uint8_t packet_type, uint16_t channel,
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
    }
    break;
  case HCI_EVENT_DISCONNECTION_COMPLETE:
    if (hci_event_disconnection_complete_get_connection_handle(packet) ==
        _conn_handle) {
      _conn_handle = HCI_CON_HANDLE_INVALID;
      _notify_en = 0;
    }
    break;
  default:
    break;
  }
}

void ota_init(void) {
  _handle_service_start = att_db_util_add_service_uuid16(OTA_SERVICE_UUID);

  _handle_ctrl_value = att_db_util_add_characteristic_uuid16(
      OTA_CTRL_UUID,
      ATT_PROPERTY_READ | ATT_PROPERTY_WRITE | ATT_PROPERTY_NOTIFY |
          ATT_PROPERTY_DYNAMIC,
      ATT_SECURITY_NONE, ATT_SECURITY_NONE, NULL, 0);
  _handle_ctrl_cccd = _handle_ctrl_value + 1;

  _handle_data_value = att_db_util_add_characteristic_uuid16(
      OTA_DATA_UUID,
      ATT_PROPERTY_WRITE | ATT_PROPERTY_WRITE_WITHOUT_RESPONSE |
          ATT_PROPERTY_DYNAMIC,
      ATT_SECURITY_NONE, ATT_SECURITY_NONE, NULL, 0);

  _service.start_handle = _handle_service_start;
  _service.end_handle = _handle_data_value;
  _service.read_callback = &ota_read_cb;
  _service.write_callback = &ota_write_cb;
  att_server_register_service_handler(&_service);

  _hci_cb_reg.callback = &ota_hci_handler;
  hci_add_event_handler(&_hci_cb_reg);

  printf("[ota] service ready (ctrl=%d data=%d, staging 0x%08x)\n",
         _handle_ctrl_value, _handle_data_value, OTA_STAGING_BASE);
}

void ota_selftest(uint32_t size) {
  if (size == 0 || size > OTA_STAGING_SIZE) {
    printf("[ota] selftest: invalid size %u\n", size);
    return;
  }
  printf("[ota] selftest: staging %u bytes of the running image\n", size);
  const uint8_t *src = (const uint8_t *)XIP_BASE;
  _received = 0;
  _buf_fill = 0;
  _sector_count = 0;
  uint32_t t0 = time_us_32();
  while (_received + _buf_fill < size) {
    uint32_t space = sizeof(_sector_buf) - _buf_fill;
    uint32_t take = size - (_received + _buf_fill);
    if (take > space) {
      take = space;
    }
    memcpy(_sector_buf + _buf_fill, src + _received + _buf_fill, take);
    _buf_fill += take;
    if (_buf_fill == sizeof(_sector_buf)) {
      if (!flush_sector()) {
        printf("[ota] selftest FAILED: flush error at %u bytes\n", _received);
        return;
      }
    }
  }
  if (_buf_fill > 0) {
    memset(_sector_buf + _buf_fill, 0xFF, sizeof(_sector_buf) - _buf_fill);
    if (!flush_sector()) {
      printf("[ota] selftest FAILED: flush error at final sector\n");
      return;
    }
  }
  uint32_t ms = (time_us_32() - t0) / 1000;
  printf("[ota] selftest: staged %u bytes in %lu ms (%u sectors)\n",
         size, ms, _sector_count);
  const uint8_t *staged = (const uint8_t *)OTA_STAGING_BASE;
  uint32_t bad = 0;
  for (uint32_t i = 0; i < size; i++) {
    if (staged[i] != src[i]) {
      bad++;
    }
  }
  printf("[ota] selftest: readback %u/%u mismatching bytes\n", bad, size);
  printf("[ota] selftest %s\n", bad == 0 ? "PASSED" : "FAILED");
}

void ota_apply_selftest(uint32_t size) {
  if (size == 0 || size > OTA_STAGING_SIZE) {
    printf("[ota] selftest apply: invalid size %u\n", size);
    return;
  }
  uint32_t crc = crc32((const uint8_t *)OTA_STAGING_BASE, size);
  ota_apply_record_t rec = {
    .magic = OTA_APPLY_MAGIC,
    .size = size,
    .crc = crc,
  };
  int rc = kvs_set(KV_KEY_OTA_APPLY, &rec, sizeof(rec));
  if (rc != KVSTORE_SUCCESS) {
    printf("[ota] selftest apply: kvs_set failed (%s)\n", kvs_strerror(rc));
    return;
  }
  printf("[ota] selftest apply: record written (size %u, crc 0x%08x), rebooting\n",
         size, crc);
  watchdog_reboot(0, 0, 0);
}
