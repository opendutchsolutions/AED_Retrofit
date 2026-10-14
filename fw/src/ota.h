/**
 * @file            ota.h
 * @brief           BLE OTA update service — stages the image in a fixed
 *                  flash slot, verifies a P-256 ECDSA signature, and
 *                  applies it at boot via a RAM-resident flasher
 *                  (ota_apply.c)
 *
 * This file is part of the AED_RETROFIT project
 * SPDX-License-Identifier: EUPL-1.2
 */

#ifndef ota_h
#define ota_h

#include <pico.h>
#include <stdbool.h>
#include <stdint.h>

/** Staging area: 1600K at the 1600K mark, below the kv-store region */
#define OTA_STAGING_BASE (XIP_BASE + 0x00190000u)
#define OTA_STAGING_SIZE (1600u * 1024u)

void ota_init(void);

/** Audio-path receiver hooks (see audio_ota.c). */
void ota_feed(const uint8_t *buffer, uint16_t size);
void ota_control(const uint8_t *buffer, uint16_t size);
uint32_t ota_current_offset(void);

/**
 * @brief At boot: apply a downloaded OTA image (if any) by flashing it
 *        over the main firmware. Requires kvs_init() to have been called.
 */
void ota_apply_check_and_run(void);

/**
 * @brief Serial self-test: stage `size` bytes of the running image into
 *        the OTA staging area through the same flush path used during a
 *        BLE update, then read back and compare. Prints PASS/FAIL.
 */
void ota_selftest(uint32_t size);
void ota_staging_crc(uint32_t size);
void ota_staging_dump(uint32_t offset);

/**
 * @brief Serial self-test: write the apply record for the staged image
 *        and reboot, so the boot-time apply path is exercised end-to-end.
 *        Only call after a successful ota_selftest() with the full image.
 */
void ota_apply_selftest(uint32_t size);

#endif
