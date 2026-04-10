#ifndef GATT_SERVICE_H
#define GATT_SERVICE_H

#include <stdint.h>
#include <stdbool.h>

// Call once from bt_begin(), before bt_run()
void gatt_service_init(void);

// Call from bt.c packet_handler once BTSTACK_EVENT_STATE → HCI_STATE_WORKING
void gatt_service_start_timer(void);

// Returns last LED bitmask written by BLE central
// bit0=SHOCK, bit1=ON_OFF, bit2=INFO, bit3=HANDS_OFF, bit4=LOW_BELLY, bit5=BREAST
uint8_t gatt_service_get_leds(void);

#endif /* GATT_SERVICE_H */