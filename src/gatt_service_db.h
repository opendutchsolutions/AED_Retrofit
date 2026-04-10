
// clang-format off
// src/gatt_service_db.h generated from src/gatt_service.gatt for BTstack
// it needs to be regenerated when the .gatt file is updated. 

// To generate src/gatt_service_db.h:
// /home/victor/.pico-sdk/sdk/2.2.0/lib/btstack/tool/compile_gatt.py src/gatt_service.gatt src/gatt_service_db.h

// att db format version 1

// binary attribute representation:
// - size in bytes (16), flags(16), handle (16), uuid (16/128), value(...)

#include <stdint.h>

// Reference: https://en.cppreference.com/w/cpp/feature_test
#if __cplusplus >= 200704L
constexpr
#endif
const uint8_t profile_data[] =
{
    // ATT DB Version
    1,

    // gatt_service.gatt
    // 0x0001 PRIMARY_SERVICE-0xFF10
    0x0a, 0x00, 0x02, 0x00, 0x01, 0x00, 0x00, 0x28, 0x10, 0xff, 
    // --- Buttons (read + notify) ---
    // Button bitmask: bit0=SHOCK, bit1=ON_OFF, bit2=INFO
    // 0x0002 CHARACTERISTIC-0xFF11 - READ | NOTIFY
    0x0d, 0x00, 0x02, 0x00, 0x02, 0x00, 0x03, 0x28, 0x12, 0x03, 0x00, 0x11, 0xff, 
    // 0x0003 VALUE CHARACTERISTIC-0xFF11 - READ | NOTIFY -'0'
    // READ_ANYBODY
    0x09, 0x00, 0x02, 0x00, 0x03, 0x00, 0x11, 0xff, 0x0, 
    // 0x0004 CLIENT_CHARACTERISTIC_CONFIGURATION
    // READ_ANYBODY, WRITE_ANYBODY
    0x0a, 0x00, 0x0e, 0x01, 0x04, 0x00, 0x02, 0x29, 0x00, 0x00, 
    // --- LEDs (read + write) ---
    // LED bitmask: bit0=SHOCK, bit1=ON_OFF, bit2=INFO, bit3=HANDS_OFF,
    //              bit4=LOW_BELLY, bit5=BREAST
    // 0x0005 CHARACTERISTIC-0xFF12 - READ | WRITE
    0x0d, 0x00, 0x02, 0x00, 0x05, 0x00, 0x03, 0x28, 0x0a, 0x06, 0x00, 0x12, 0xff, 
    // 0x0006 VALUE CHARACTERISTIC-0xFF12 - READ | WRITE -'0'
    // READ_ANYBODY, WRITE_ANYBODY
    0x09, 0x00, 0x0a, 0x00, 0x06, 0x00, 0x12, 0xff, 0x0, 
    // END
    0x00, 0x00, 
}; // total size 38 bytes 


//
// list service handle ranges
//
#define ATT_SERVICE_0xFF10_START_HANDLE 0x0001
#define ATT_SERVICE_0xFF10_END_HANDLE 0x0006
#define ATT_SERVICE_0xFF10_01_START_HANDLE 0x0001
#define ATT_SERVICE_0xFF10_01_END_HANDLE 0x0006

//
// list mapping between characteristics and handles
//
#define ATT_CHARACTERISTIC_0xFF11_01_VALUE_HANDLE 0x0003
#define ATT_CHARACTERISTIC_0xFF11_01_CLIENT_CONFIGURATION_HANDLE 0x0004
#define ATT_CHARACTERISTIC_0xFF12_01_VALUE_HANDLE 0x0006
