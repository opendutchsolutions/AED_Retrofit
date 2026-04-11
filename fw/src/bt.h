/**
 * @file            bt.h
 * @brief           Module for stack initialization and event handling for
 *                  Classic BT and BLE dual-mode operation
 *
 * @par
 * Copyright 2025 (C) Joba-1 (Modified by OpenDutchSolutions Foundation)
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
 * Author:    Joba-1
 *            Hoog-V
 *
 * Modifications made:
 * - Document & Restructure code
 * - Added explicit (void) to functions with no parameters
 * - Added once-guard to bt_begin() to prevent double initialization
 * - Added BLE advertising and scan response support (dual-mode)
 * - Added SDP, SM (Security Manager) and GATT service initialization
 * - Added debug logging for Classic BT connection request and complete events
 * - Added startup logging of local BD address
 */

#ifndef bt_h
#define bt_h

#include <bluetooth.h>
#include <stdbool.h>

/**
 * @brief Callback function definition for the bluetooth up event callback
 * @param data Pointer to user-provided data structure.
 */
typedef void (*bt_on_up_cb_t)(void *);

/**
 * @brief Initializes the Bluetooth classic and BLE stack
 *        and subsequent protocol layers (A2DP, SDP, AVRCP, GATT)
 * @param name The bluetooth advertising name
 * @param pin The bluetooth pairing pin-code
 * @param cb Function pointer for bluetooth stack initialized callback
 * @param data User-provided data that get's passed into the callback
 */
void bt_begin(const char *name, const char *pin, bt_on_up_cb_t cb, void *data);

/**
 * @brief Runs the bluetooth stack (enters the btstack run-loop)
 */
void bt_run();

/**
 * @brief Checks whether the BT stack is active
 * @return Returns true if stack is active, false if inactive
 */
bool bt_up();

/**
 * @brief Change the local addr of the Bluetooth Phy
 * @param local_addr The local addr to change to
 */
void bt_addr(bd_addr_t local_addr);

#endif