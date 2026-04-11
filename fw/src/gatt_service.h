/**
 * @file            gatt_service.h
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

#ifndef GATT_SERVICE_H
#define GATT_SERVICE_H

#include <stdbool.h>
#include <stdint.h>

/**
 * @brief Initialize the BLE GATT protocol layer
 */
void gatt_service_init(void);

/**
 * @brief Initialize the BLE background timer for polling the buttons
 */
void gatt_service_start_timer(void);

/**
 * @brief Helper to get the current Led + buzzer bitmask written by BLE GATT
 * @return Led mask byte with:
 *         Bit0=SHOCK
 *         Bit1=ON_OFF
 *         Bit2=INFO
 *         Bit3=HANDS_OFF
 *         Bit4=LOW_BELLY
 *         Bit5=Breast
 *         Bit6=Buzzer
 */
uint8_t gatt_service_get_leds(void);

#endif /* GATT_SERVICE_H */