/**
 * @file            sdp.h
 * @brief           SDP record registration for A2DP sink, AVRCP controller,
 *                  AVRCP target and device ID (PnP) Bluetooth profiles
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

#ifndef sdp_h
#define sdp_h

/**
 * @brief Initialize the SDP protocol layer
 *        (responsible for identifying the device as audio_device)
 */
void sdp_begin();

#endif