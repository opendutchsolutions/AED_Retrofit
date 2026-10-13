/**
 * @file            ota.h
 * @brief           BLE OTA update — stages the image in the inactive app
 *                  partition and lets the RP2350 bootrom apply it
 *                  (flash-update boot, see RP2350 datasheet section 5)
 *
 * This file is part of the AED_RETROFIT project
 * SPDX-License-Identifier: EUPL-1.2
 */

#ifndef ota_h
#define ota_h

#include <stdbool.h>
#include <stdint.h>

/** UF2 family of our application images (rp2350-arm-s) */
#define OTA_FAMILY_ID 0xe48bff57u

void ota_init(void);

/**
 * @brief After boot: if this boot was a flash-update boot, buy (commit)
 *        the new image. Call once early from main().
 */
void ota_check_flash_update_boot(void);

#endif
