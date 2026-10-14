/**
 * @file            ota.c
 * @brief           BLE OTA GATT service (0xFF20) staging an incoming
 *                  firmware image in the inactive boot partition; the
 *                  image is verified (CRC32 + P-256 ECDSA) and applied
 *                  by the bootrom's TBYB flash-update boot
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

#include "boot/picobin.h"
#include "boot/picoboot.h"
#include "bt.h"
#include "hardware/regs/addressmap.h"
#include "ota_pub_key.h"

// Declared directly instead of including uECC.h: micro-ecc's asm-labelled
// declarations confuse the Thumb linker. P-256, 64-byte key/signature.
extern int uECC_verify(const uint8_t public_key[64], const uint8_t hash[32],
                       const uint8_t signature[64]);

#define OTA_SERVICE_UUID 0xFF20
#define OTA_CTRL_UUID 0xFF21
#define OTA_DATA_UUID 0xFF22

// Update slot: the inactive boot partition (A/B), resolved from the
// partition table via the bootrom. The image is staged there and the
// bootrom boots it (TBYB flash update); the new image commits with
// rom_explicit_buy() at startup, and the bootrom rolls back to the
// previous slot if it never boots.
#define UF2_FAMILY_RP2350_ARM_S 0xe48bff59u

static uint32_t _slot_off = 0; // flash storage offset of the inactive partition
static uint32_t _staging_size = 0;
static uint8_t _bootrom_workarea[4096] __attribute__((aligned(4)));

// Reads of the staged image go through the raw storage (no-translate)
// window: with a partition-table boot, the normal XIP window only covers
// the partition the running image booted from, not the inactive one.
static const uint8_t *staging_read_ptr(uint32_t off) {
  return (const uint8_t *)(XIP_NOCACHE_NOALLOC_NOTRANSLATE_BASE + _slot_off + off);
}

static int _slots_rc = -999; // bootrom rc from the last slot resolution

int ota_slots_rc(void) { return _slots_rc; }

bool ota_slots_init(void) { // returns false only on negative bootrom rc
  resident_partition_t part;
  int rc = rom_get_uf2_target_partition(_bootrom_workarea,
                                        sizeof(_bootrom_workarea),
                                        UF2_FAMILY_RP2350_ARM_S, &part);
  _slots_rc = rc;
  // >= 0 is the chosen partition index; only negative values are errors
  if (rc < 0) {
    printf("[ota] no partition table (bootrom rc %d) — OTA disabled\n", rc);
    return false;
  }
  uint32_t first =
      (part.permissions_and_location &
       PICOBIN_PARTITION_LOCATION_FIRST_SECTOR_BITS) >>
      PICOBIN_PARTITION_LOCATION_FIRST_SECTOR_LSB;
  uint32_t last =
      (part.permissions_and_location &
       PICOBIN_PARTITION_LOCATION_LAST_SECTOR_BITS) >>
      PICOBIN_PARTITION_LOCATION_LAST_SECTOR_LSB;
  _slot_off = first * FLASH_SECTOR_SIZE;
  _staging_size = (last + 1 - first) * FLASH_SECTOR_SIZE;
  printf("[ota] update slot: 0x%08x..0x%08x (%u kB)\n",
         XIP_BASE + _slot_off, XIP_BASE + _slot_off + _staging_size,
         _staging_size / 1024);
  return true;
}

const uint8_t *ota_staging_base(void) {
  return (const uint8_t *)(XIP_BASE + _slot_off);
}
uint32_t ota_staging_size(void) { return _staging_size; }

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
static uint32_t _sig_count = 0;
static bool _dry_run = false; // START flag bit0: count only, no flash
static uint32_t _staged_crc = 0; // image crc of the current/last transfer
static uint32_t _stage_check_crc = 0; // on-demand staging checksum (cmd 0x05)
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

#define OTA_STATUS_LEN 14
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
  out[10] = _stage_check_crc & 0xFF;
  out[11] = (_stage_check_crc >> 8) & 0xFF;
  out[12] = (_stage_check_crc >> 16) & 0xFF;
  out[13] = (_stage_check_crc >> 24) & 0xFF;
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

// TBYB flash-update boot: the bootrom boots the staged image from the
// inactive partition in try mode; the new image commits with
// rom_explicit_buy() and a failed boot rolls back to the old slot.
void ota_update_reboot(void) {
  printf("[ota] rebooting for flash update (slot 0x%08x)\n",
         XIP_BASE + _slot_off);
  rom_reboot(REBOOT2_FLAG_REBOOT_TYPE_FLASH_UPDATE, 100,
             XIP_BASE + _slot_off, 0);
}

static void reboot_timer_cb(btstack_timer_source_t *ts) {
  UNUSED(ts);
  ota_update_reboot();
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
    memcpy(chunk, staging_read_ptr(off), n);
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
  _flush_param.offset = _slot_off + _received;
  int rc = flash_safe_execute(ota_erase_sector, &_flush_param, 100);
  if (rc != PICO_OK) {
    printf("[ota] erase failed: %d\n", rc);
    return false;
  }
  _flush_param.buf_off = 0;
  for (uint32_t off = 0; off < FLASH_SECTOR_SIZE_4K; off += FLASH_PAGE_SIZE_256) {
    _flush_param.offset = _slot_off + _received + off;
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
  if (_sector_count % 32 == 0) {
    printf("[ota] %u kB staged\n", _received / 1024);
  }
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
  if (_received < _image_size) {
    set_error(OTA_ERR_INCOMPLETE);
    return;
  }

  printf("[ota] verifying %u bytes\n", _image_size);
  // CRC covers the image only — not the 64 signature bytes riding the stream
  uint32_t crc = crc32(staging_read_ptr(0), _image_size);
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
    return; // ignore data outside a transfer
  }
  if (_dry_run) {
    _received += size; // diagnostic mode: count only, no flash
    return;
  }
  (void)_write_count;
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
      // Signature bytes count separately: _received must stay
      // image-only, because flush_sector writes the final partial
      // sector at staging offset _received — counting the 64 signature
      // bytes here shifted the final sector 64 bytes too far (corrupting
      // the tail of every image not aligned to 4 kB).
      _sig_count += sig_take;
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
    if (_staging_size == 0 || img_size == 0 || img_size > _staging_size ||
        total_size != img_size + 64 || total_size > _staging_size + 64 ||
        resume_off > img_size || (resume_off % FLASH_SECTOR_SIZE_4K) != 0) {
      set_error(OTA_ERR_TOO_BIG);
      return;
    }
    _image_size = img_size;
    _image_crc = total_crc; // CRC covers image bytes only (0..img_size)
    _staged_crc = total_crc; // resume state survives disconnects
    _stage_check_crc = 0;
    _received = resume_off;
    _buf_fill = 0;
    _sig_count = 0;
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
  case 0x05: { // STAGE-CHECK [offset:u32] -> crc32(staging[0..offset)),
              // readable via the ctrl characteristic (bytes 10..13)
    if (size < 5) {
      return;
    }
    uint32_t off = little_endian_read_32(buffer, 1);
    if (off > _staging_size) {
      _stage_check_crc = 0;
      return;
    }
    _stage_check_crc = off ? crc32(staging_read_ptr(0), off) : 0;
    printf("[ota] stage-check %u kB -> 0x%08x\n", off / 1024,
           _stage_check_crc);
    break;
  }
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
         _handle_ctrl_value, _handle_data_value, XIP_BASE + _slot_off);
}

void ota_staging_dump(uint32_t offset) {
  if (offset >= _staging_size) {
    printf("[ota] stagedump: invalid offset %u\n", offset);
    return;
  }
  printf("[ota] stagedump @%u:", offset);
  const uint8_t *p = staging_read_ptr(offset);
  for (int i = 0; i < 32; i++) {
    printf(" %02x", p[i]);
  }
  printf("\n");
}

void ota_staging_crc(uint32_t size) {
  if (size == 0 || size > _staging_size) {
    printf("[ota] stagecrc: invalid size %u\n", size);
    return;
  }
  uint32_t crc = crc32(staging_read_ptr(0), size);
  printf("[ota] stagecrc: %u bytes -> 0x%08x\n", size, crc);
  // per-64 kB chunks to locate corruption
  for (uint32_t off = 0; off < size; off += 65536u) {
    uint32_t n = size - off;
    if (n > 65536u) n = 65536u;
    printf("[ota] stagecrc %3u kB: 0x%08x\n", off / 1024,
           crc32(staging_read_ptr(off), n));
  }
}

void ota_selftest(uint32_t size, uint32_t src_off) {
  if (size == 0 || size > _staging_size) {
    printf("[ota] selftest: invalid size %u\n", size);
    return;
  }
  printf("[ota] selftest: staging %u bytes of flash data at XIP_BASE\n", size);
  const uint8_t *src = (const uint8_t *)XIP_NOCACHE_NOALLOC_NOTRANSLATE_BASE + src_off;
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
  const uint8_t *staged = staging_read_ptr(0);
  uint32_t bad = 0;
  for (uint32_t i = 0; i < size; i++) {
    if (staged[i] != src[i]) {
      bad++;
    }
  }
  printf("[ota] selftest: readback %u/%u mismatching bytes\n", bad, size);
  printf("[ota] selftest %s\n", bad == 0 ? "PASSED" : "FAILED");
}
