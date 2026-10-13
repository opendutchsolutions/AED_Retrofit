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

/**
 * @brief At boot: apply a downloaded OTA image (if any) by flashing it
 *        over the main firmware. Requires kvs_init() to have been called.
 */
void ota_apply_check_and_run(void);

#endif
