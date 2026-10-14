/**
 * @file            audio_ota.c
 * @brief           Firmware reception over the A2DP audio link using
 *                  spectral-barcode modulation
 *
 * Wire format (48 kHz, left channel):
 *  - block  = 128 samples (2.67 ms); slot k tone = (k+1) * fs/128 Hz,
 *    k = 0..39 -> 375 Hz .. 15 kHz (all measured to pass the SBC channel
 *    with <0.5% deviation and no measurable crosstalk)
 *  - a block encodes 40 bits: bit k = 1 when slot k is on
 *  - superframe = 8 blocks: block 0 carries a fixed 40-bit sync pattern,
 *    blocks 1..7 carry 280 bits = 35 bytes
 *  - superframe bytes: [0] type [2..3] seq [4..31] payload [32..33] CRC16
 *    (types: 1 DATA, 2 START, 3 FINISH, 4 ABORT; CRC over bytes 0..31)
 *
 * DATA payload is 28 bytes at image offset seq*28. Only in-sequence data
 * (matching the staging position) is accepted; gaps are skipped and the
 * sender resumes from the device's confirmed offset on the next pass.
 */

#include "audio_ota.h"

#include "ota.h"
#include "pico/stdlib.h"
#include <math.h>
#include <stdio.h>
#include <string.h>

#define AO_BLOCK 128u
#define AO_SLOTS 40u
#define AO_DATA_SLOTS 39u /* slot 0 is an always-on pilot tone */
#define AO_SUPFR_DATA_BLOCKS 7u
#define AO_PAYLOAD 28u
#define AO_SYNC_ERRORS_MAX 6u

// 40-bit sync pattern (pseudo-random, good autocorrelation)
// 39-bit sync pattern in slots 1..39 (pilot is slot 0)
#define AO_SYNC_PATTERN 0x9A2B7C1D55ull

typedef enum { AO_GAP = 0, AO_TONE = 1, AO_SYNCED = 2 } ao_state_t;

// The device's demod windows have arbitrary phase relative to the
// sender's block boundaries, so the sender prepends a 16-sample silence
// gap to every block and the receiver aligns on it (energy-based clock
// recovery). Thresholds are sums of |x| over a 16-sample window; SBC
// silence is digital zero and a single tone gives ~150k.
#define AO_WIN 16u
#define AO_QUIET_THR 20000
#define AO_LOUD_THR 60000

static bool _armed = false;
static ao_state_t _state = AO_GAP;
static uint32_t _phase = 0;              // block index within superframe
static uint64_t _data_bits[AO_SUPFR_DATA_BLOCKS];
static int16_t _block_buf[AO_BLOCK];
static uint32_t _block_fill = 0;
static float _coeff[AO_SLOTS];
static int16_t _win_buf[AO_WIN];
static uint32_t _win_idx = 0;
static int32_t _win_sum = 0;
static uint32_t _quiet_run = 0;
static uint32_t _loud_run = 0;
static bool _was_quiet = false;

// statistics
static uint32_t _blocks, _syncs, _sf_ok, _sf_bad, _sf_skip, _sf_gap, _fed;
static uint32_t _last_seq = 0xFFFFFFFFu;
static uint32_t _sync_err_max = 0;

static uint16_t crc16(const uint8_t *data, uint32_t len) {
  uint16_t crc = 0xFFFF;
  for (uint32_t i = 0; i < len; i++) {
    crc ^= (uint16_t)data[i] << 8;
    for (int b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? (uint16_t)((crc << 1) ^ 0x1021) : (uint16_t)(crc << 1);
    }
  }
  return crc;
}

static void ao_init_coeff(void) {
  static bool init = false;
  if (init) {
    return;
  }
  const float fs = 48000.0f;
  for (uint32_t k = 0; k < AO_SLOTS; k++) {
    float freq = (float)(k + 1) * (fs / (float)AO_BLOCK);
    float w = 2.0f * 3.14159265f * freq / fs;
    _coeff[k] = 2.0f * cosf(w);
  }
  init = true;
}

void audio_ota_arm(bool on) {
  _armed = on;
  _state = AO_GAP;
  _phase = 0;
  _block_fill = 0;
  _win_idx = 0;
  _win_sum = 0;
  _quiet_run = 0;
  _loud_run = 0;
  _was_quiet = false;
  _syncs = _sf_ok = _sf_bad = _sf_skip = _sf_gap = _fed = 0;
  _last_seq = 0xFFFFFFFFu;
  _sync_err_max = 0;
  if (on) {
    ao_init_coeff();
    printf("[aota] armed: expecting superframes\n");
  } else {
    printf("[aota] disarmed\n");
  }
}

bool audio_ota_armed(void) { return _armed; }

// One superframe of 35 assembled bytes -> dispatch
static void ao_dispatch(const uint8_t sf[35]) {
  uint16_t crc = crc16(sf, 32);
  uint16_t wire = (uint16_t)(sf[32] | (sf[33] << 8));
  if (crc != wire) {
    _sf_bad++;
    return;
  }
  uint8_t type = sf[0];
  uint16_t seq = (uint16_t)(sf[2] | (sf[3] << 8));
  if (type == 1) { // DATA: 28 bytes at offset seq*28
    uint32_t off = (uint32_t)seq * AO_PAYLOAD;
    uint32_t cur = ota_current_offset();
    if (off + AO_PAYLOAD <= cur) {
      _sf_skip++; // already staged
      return;
    }
    if (off > cur) {
      _sf_gap++; // lost data before this point — wait for the next pass
      return;
    }
    ota_feed(&sf[4], AO_PAYLOAD);
    _fed++;
    _last_seq = seq;
  } else if (type == 2) { // START [total:u32][crc:u32][img_size:u32][offset:u32]
    uint8_t cmd[21];
    cmd[0] = 0x01;
    memcpy(&cmd[1], &sf[4], 16); // total, crc, img_size, offset (u32 LE each)
    cmd[17] = 0;                  // flags
    printf("[aota] START seq=%u\n", seq);
    ota_control(cmd, sizeof(cmd));
  } else if (type == 3) { // FINISH
    uint8_t cmd[1] = {0x02};
    printf("[aota] FINISH — verifying\n");
    ota_control(cmd, 1);
  } else if (type == 4) { // ABORT
    uint8_t cmd[1] = {0x03};
    printf("[aota] ABORT\n");
    ota_control(cmd, 1);
  }
  _sf_ok++;
}

static void ao_block_bits(void);

static void ao_sample(int16_t x) {
  // rolling |x| window for gap detection
  _win_sum -= _win_buf[_win_idx] < 0 ? -_win_buf[_win_idx] : _win_buf[_win_idx];
  _win_buf[_win_idx] = x;
  _win_sum += x < 0 ? -x : x;
  _win_idx = (_win_idx + 1) % AO_WIN;

  if (_win_sum < AO_QUIET_THR) {
    _quiet_run++;
    _loud_run = 0;
    if (_quiet_run >= AO_WIN) {
      _was_quiet = true; // a full silence window went by
    }
  } else {
    _loud_run++;
    if (_state == AO_GAP && _was_quiet && _win_sum >= AO_LOUD_THR) {
      // tone region started a few samples ago: align the demod window
      _state = AO_TONE;
      _block_fill = 0;
      _was_quiet = false;
    } else if (_loud_run > 64) {
      _was_quiet = false; // long loud stretch (music?) — not a boundary
    }
    _quiet_run = 0;
  }
  if (_state == AO_TONE) {
    _block_buf[_block_fill++] = x;
    if (_block_fill == AO_BLOCK) {
      ao_block_bits();
      _state = AO_GAP;
      _quiet_run = 0;
    }
  }
}

// One complete 128-sample block: 40 Goertzel energies -> 40 bits
static void ao_block_bits(void) {
  uint64_t bits = 0;
  float max_p = 0.0f;
  float power[AO_SLOTS];
  for (uint32_t k = 1; k < AO_SLOTS; k++) { // skip pilot slot 0
    float coeff = _coeff[k];
    float s1 = 0.0f, s2 = 0.0f;
    for (uint32_t i = 0; i < AO_BLOCK; i++) {
      float s0 = (float)_block_buf[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    power[k] = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    if (power[k] > max_p) {
      max_p = power[k];
    }
  }
  // ON slots all have equal power (constant-RMS encoding); the pilot
  // (slot 0, boosted by SBC's low-frequency allocation) is excluded from
  // the threshold. OFF slots must stay below half of the data-slot max.
  float thr = max_p * 0.3f;
  for (uint32_t k = 1; k < AO_SLOTS; k++) {
    if (power[k] > thr) {
      bits |= 1ull << k;
    }
  }
  _blocks++;

  // NOTE: an all-zero block is VALID data (zero runs in the image);
  // garbage from music is rejected by the superframe CRC.
  if (_phase == 0) {
    // expect the sync pattern
    uint32_t d = __builtin_popcountll(((bits >> 1) ^ AO_SYNC_PATTERN) & 0x7FFFFFFFFFull);
    if (d > _sync_err_max) {
      _sync_err_max = d;
    }
    if (d <= AO_SYNC_ERRORS_MAX) {
      static uint32_t _last_sync_block = 0;
      uint32_t since = _blocks - _last_sync_block;
      if (_last_sync_block != 0 && since != 8) {
        printf("[aota] slip: %u blocks between syncs\n", since);
      }
      _last_sync_block = _blocks;
      _phase = 1;
      _syncs++;
    }
    return; // sync block never carries data
  }

  _data_bits[_phase - 1] = bits;
  _phase++;
  if (_phase > AO_SUPFR_DATA_BLOCKS) {
    // assemble 35 bytes: bit t = slot (t%40) of data block (t/40)
    uint8_t sf[35];
    memset(sf, 0, sizeof(sf));
    for (uint32_t t = 0; t < 273; t++) {
      if ((_data_bits[t / AO_DATA_SLOTS] >> ((t % AO_DATA_SLOTS) + 1)) & 1u) {
        sf[t / 8] |= (uint8_t)(1u << (t % 8));
      }
    }
    ao_dispatch(sf);
    _phase = 0;
  }
}

void audio_ota_pcm(const int16_t *stereo, uint32_t frames) {
  if (!_armed) {
    return;
  }
  for (uint32_t i = 0; i < frames; i++) {
    ao_sample(stereo[2 * i]); // left channel
  }
}

void audio_ota_stats(void) {
  printf("[aota] armed=%d blocks=%u syncs=%u sf_ok=%u sf_bad=%u "
         "sf_skip=%u sf_gap=%u fed=%u last_seq=%u\n",
         _armed ? 1 : 0, _blocks, _syncs, _sf_ok, _sf_bad, _sf_skip, _sf_gap,
         _fed, _last_seq == 0xFFFFFFFFu ? 0 : _last_seq);
  printf("[aota] sync_err_max=%u\n", _sync_err_max);
}
