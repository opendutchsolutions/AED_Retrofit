#pragma once

#include <stdbool.h>
#include <stdint.h>

/**
 * Audio-path OTA: receives firmware over the A2DP audio link using
 * spectral-barcode modulation (40 orthogonal tones, 128-sample blocks,
 * 8-block superframes with a sync pattern and CRC16). Verified payload
 * is fed into the existing OTA staging machine (same path as BLE).
 *
 * The demodulator only runs while armed — normal trainer audio use is
 * unaffected.
 */
void audio_ota_arm(bool on);
bool audio_ota_armed(void);

/** Serial: report receive statistics. */
void audio_ota_stats(void);

/** Feed decoded A2DP PCM (interleaved stereo, left channel used). */
void audio_ota_pcm(const int16_t *stereo, uint32_t frames);
