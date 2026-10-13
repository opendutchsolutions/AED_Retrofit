/**
 * @file            ota_pub_key.h
 * @brief           P-256 public key used to verify OTA update signatures.
 *                  The matching private key (ota_signing_key.pem) is kept
 *                  in CI secrets and never on the device.
 *
 * This file is part of the AED_RETROFIT project
 * SPDX-License-Identifier: EUPL-1.2
 */

#ifndef ota_pub_key_h
#define ota_pub_key_h

#include <stdint.h>

/** Uncompressed point without the 0x04 prefix: X (32 bytes) || Y (32 bytes) */
static const uint8_t OTA_PUB_KEY[64] = {
    0x8fu, 0x2bu, 0x72u, 0x6au, 0x36u, 0xc1u, 0x73u, 0x2du, 0x6du, 0x7eu, 0xe7u, 0xa6u, 0x8cu, 0x36u, 0xf4u, 0xf1u,
};

#endif
