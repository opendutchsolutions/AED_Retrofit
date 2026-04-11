#ifndef bt_h
#define bt_h

#include <bluetooth.h>
#include <stdbool.h>

/**
 * @brief Callback function definition for the bluetooth up event callback
 * @param data Pointer to user-provided data structure.
 */
typedef void (*bt_on_up_cb_t)( void * );

/**
 * @brief Initializes the Bluetooth classic and BLE stack 
 *        and subsequent protocol layers (A2DP, SDP, AVRCP, GATT)
 * @param name The bluetooth advertising name
 * @param pin The bluetooth pairing pin-code
 * @param cb Function pointer for bluetooth stack initialized callback
 * @param data User-provided data that get's passed into the callback
 */
void bt_begin( const char *name, const char *pin, bt_on_up_cb_t cb, void *data );

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
void bt_addr( bd_addr_t local_addr );

#endif