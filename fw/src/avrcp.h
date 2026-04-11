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