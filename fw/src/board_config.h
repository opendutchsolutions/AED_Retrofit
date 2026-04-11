/**
 * @file            board_config.h
 * @brief           Board configuration file containing the board pin mapping
 *
 * @par
 * Copyright 2026 (C) OpenDutchSolutions Foundation
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, see <https://www.gnu.org/licenses/>.
 * 
 * This file is part of the AED_RETROFIT project
 *
 * Author:          Victor Hogeweij
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