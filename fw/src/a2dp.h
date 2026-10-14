/**
 * @file            a2dp.h
 * @brief           Module for A2DP SBC audio streaming over Bluetooth
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

#ifndef a2dp_h
#define a2dp_h

#include <bluetooth.h>
#include <stdint.h>

/**
 * @brief Initializes the A2DP Bluetooth Audio Layer
 */
void a2dp_sink_begin();

/**
 * @brief Establish an outgoing A2DP stream to a previously paired source
 * @param remote BD address of the audio source (e.g. the instructor PC)
 * @return ERROR_CODE_SUCCESS when the connection attempt was started
 */
uint8_t a2dp_sink_connect_peer(bd_addr_t remote);

#endif

/** Serial diagnostic: measure per-slot tone energy of the A2DP PCM
 * stream (Goertzel, 128-sample blocks) to characterize the SBC channel. */
void a2dp_pcm_analyze_start(uint32_t blocks);
void a2dp_pcm_analyze_report(void);
