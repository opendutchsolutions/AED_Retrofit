/**
 * @file            ota_apply.c
 * @brief           Boot-time OTA applier — re-verifies the downloaded
 *                  image and flashes it over the main firmware from RAM,
 *                  then resets
 *
 * This file is part of the AED_RETROFIT project
 * SPDX-License-Identifier: EUPL-1.2
 */

#include "ota.h"

#include <hardware/flash.h>
#include <hardware/sync.h>
#include <hardware/watchdog.h>
#include <pico.h>
#include <pico/stdlib.h>
#include <stdio.h>
#include <string.h>

#include "kvstore.h"

#define KV_KEY_OTA_APPLY "ota_apply"
#define OTA_APPLY_MAGIC 0x4F544131u /* "OTA1" */

typedef struct {
  uint32_t magic;
  uint32_t size;
  uint32_t crc;
} ota_apply_record_t;

// Erases the main region and programs the image from the staging slot.
// Everything called here runs from RAM or bootrom: with interrupts off,
// no code may execute from flash while it is being reprogrammed.
static void __no_inline_not_in_flash_func(flash_and_reset)(uint32_t slot_off,
                                                           uint32_t size) {
  static uint8_t page[FLASH_PAGE_SIZE];
  uint32_t sectors = (size + FLASH_SECTOR_SIZE - 1) / FLASH_SECTOR_SIZE;

  save_and_disable_interrupts();

  for (uint32_t s = 0; s < sectors; s++) {
    uint32_t base = s * FLASH_SECTOR_SIZE;
    flash_range_erase(base, FLASH_SECTOR_SIZE);
    for (uint32_t p = 0; p < FLASH_SECTOR_SIZE; p += FLASH_PAGE_SIZE) {
      // XIP is re-enabled between flash_range_* calls, so the source
      // can be read straight from the staging slot in flash.
      const uint8_t *src = (const uint8_t *)(XIP_BASE + slot_off + base + p);
      uint32_t chunk = FLASH_PAGE_SIZE;
      if (base + p + chunk > size) {
        chunk = size - (base + p);
      }
      memcpy(page, src, chunk);
      memset(page + chunk, 0xFF, FLASH_PAGE_SIZE - chunk);
      flash_range_program(base + p, page, FLASH_PAGE_SIZE);
    }
  }

  // Reset directly via watchdog registers — no flash-resident calls
  volatile uint32_t *load =
      (volatile uint32_t *)(WATCHDOG_BASE + WATCHDOG_LOAD_OFFSET);
  volatile uint32_t *ctrl =
      (volatile uint32_t *)(WATCHDOG_BASE + WATCHDOG_CTRL_OFFSET);
  *load = 0;
  *ctrl = WATCHDOG_CTRL_ENABLE_BITS;
  while (true) {
    tight_loop_contents();
  }
}

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

void ota_apply_check_and_run(void) {
  ota_apply_record_t rec;
  size_t value_size = 0;
  int rc = kvs_get(KV_KEY_OTA_APPLY, &rec, sizeof(rec), &value_size);
  if (rc != KVSTORE_SUCCESS || value_size < sizeof(rec) ||
      rec.magic != OTA_APPLY_MAGIC) {
    return;
  }
  // Consume the record first so the new image boots with a clean state
  kvs_delete(KV_KEY_OTA_APPLY);

  if (rec.size == 0 || rec.size > OTA_STAGING_SIZE) {
    printf("[ota] apply record invalid, ignored\n");
    return;
  }
  uint32_t crc = crc32((const uint8_t *)OTA_STAGING_BASE, rec.size);
  if (crc != rec.crc) {
    printf("[ota] staged image crc mismatch, ignored\n");
    return;
  }

  printf("[ota] applying %u bytes\n", rec.size);
  flash_and_reset(OTA_STAGING_BASE - XIP_BASE, rec.size);
}
