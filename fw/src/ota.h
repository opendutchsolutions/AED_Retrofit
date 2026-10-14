/**
 * @file            ota.h
 * @brief           BLE OTA update service — stages the image in the
 *                  inactive boot partition (A/B partition-table slots),
 *                  verifies a P-256 ECDSA signature, then reboots into
 *                  the bootrom's TBYB flash-update boot. The new image
 *                  commits itself with rom_explicit_buy() at startup;
 *                  if it never boots, the bootrom rolls back to the
 *                  previous slot.
 *
 * This file is part of the AED_RETROFIT project
 * SPDX-License-Identifier: EUPL-1.2
 */

#ifndef ota_h
#define ota_h

#include <pico.h>
#include <stdbool.h>
#include <stdint.h>

/**
 * @brief Resolve the update slot (the inactive boot partition) from the
 *        partition table via the bootrom. Call once at boot, before
 *        ota_init().
 * @return false when no partition table is present — OTA is disabled.
 */
bool ota_slots_init(void);

/** XIP address of the update slot (inactive boot partition). */
const uint8_t *ota_staging_base(void);

/** Size in bytes of the update slot. */
uint32_t ota_staging_size(void);

/** Bootrom rc from the last ota_slots_init() (0 = success). */
int ota_slots_rc(void);

void ota_init(void);

/**
 * @brief Serial self-test: stage `size` bytes of flash data (read via the
 *        raw storage window from `src_off`) into the update slot through
 *        the same flush path used during a BLE update, then read back and
 *        compare. Prints PASS/FAIL.
 */
void ota_selftest(uint32_t size, uint32_t src_off);

/**
 * @brief Serial test hook: reboot into the bootrom's TBYB flash-update
 *        boot targeting the update slot (as the OTA FINISH path does).
 */
void ota_update_reboot(void);
void ota_staging_crc(uint32_t size);
void ota_staging_dump(uint32_t offset);

#endif
