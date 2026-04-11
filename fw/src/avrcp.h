/**
 * @file            avrcp.h
 * @brief           Module for Bluetooth AVRCP playback status and
 *                  volume control
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
 */

#ifndef avrcp_h
#define avrcp_h

#include <btstack.h>

/**
 * @brief Initializes the AVRCP Bluetooth Audio Control Layer
 */
void avrcp_begin();

/**
 * @brief Get the current volume state (from 0 to 127 %)
 * @return Returns the current volume (in range 0 to 127 %)
 */
uint8_t avrcp_get_volume();

/**
 * @brief Get the connection status of the AVRCP layer
 * @return Returns true if the AVRCP layer is initialized
 *         and functioning, false if it is not connected/initialized.
 */
bool avrcp_is_connected();

/**
 * @brief Get the current play status from the AVRCP layer
 * @return Returns true if an audio track is currently playing
 *         false if no audio track is currently playing.
 */
bool avrcp_is_playing();

#endif