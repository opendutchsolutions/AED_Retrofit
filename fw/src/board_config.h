/**
 * @file            board_config.h
 * @brief           Board configuration file containing the board pin mapping
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

#ifndef BOARD_CONFIG_H
#define BOARD_CONFIG_H

#define STATUS_LED_R_PIN 0
#define STATUS_LED_G_PIN 7
#define STATUS_LED_B_PIN 13

#define SHOCK_BUTTON_PIN 27
#define ON_OFF_BUTTON_PIN 28
#define INFO_BUTTON_PIN 1

#define SHOCK_LED_PIN 26
#define ON_OFF_LED_PIN 22

#define INFO_LED_PIN 6
#define HANDS_OFF_LED_PIN 3
#define LOW_BELLY_INDICATOR_PIN 2
#define BREAST_INDICATOR_PIN 5
#define BUZZER_PIN 4

#define CARD_SLOT_PIN 21
#define PADS_INSERTED_PIN 20

#endif /* BOARD_CONFIG_H */