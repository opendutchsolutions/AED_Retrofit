#ifndef GATT_PROFILE_H
#define GATT_PROFILE_H

// Handles are assigned sequentially by att_db_util in gatt_service_init().
// Call order → handle mapping:
//
//  att_db_util_add_service_uuid16(0xFF10)                          → 1
//  att_db_util_add_characteristic_uuid16(0xFF11, READ|NOTIFY, …)  → decl=2, value=3, cccd=4
//  att_db_util_add_characteristic_uuid16(0xFF12, READ|WRITE_WR, …)→ decl=5, value=6
//
// Do not reorder the calls in gatt_service_init() without updating these.

#define HANDLE_BUTTONS_VALUE    3
#define HANDLE_BUTTONS_CCCD     4
#define HANDLE_LEDS_VALUE       6

#endif /* GATT_PROFILE_H */