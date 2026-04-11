#ifndef GATT_SERVICE_H
#define GATT_SERVICE_H

#include <stdint.h>
#include <stdbool.h>

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