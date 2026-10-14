import { useCallback, useEffect, useRef } from 'react';

// Single cropped beats, scheduled individually so the ratio is exact
const CLICK_BEAT = 'audio/metronome_click.wav';      // one compression click
const VENT_BEAT = 'audio/ventilation_beat.wav';      // one ventilation tone
// Compression cadence: 110/min per the reanimation guideline
const CLICK_BEAT_MS = 60000 / 110;
// Ventilation pace: one ventilation per ~1.4 s tone
const VENT_BEAT_MS = 1400;

/** ratio label -> { compressions, ventilations } */
export const METRONOME_RATIOS = {
  '30:2': { compressions: 30, ventilations: 2 },
  '15:2': { compressions: 15, ventilations: 2 },
  '10:1': { compressions: 10, ventilations: 1 },
};

/**
 * CPR metronome built from single beats: each compression schedules one
 * click at the 110/min cadence, each ventilation schedules one tone, and
 * the selected ratio (compressions : ventilations) repeats until stop().
 */
export function useMetronome() {
  const timersRef = useRef([]);
  const runningRef = useRef(false);

  const stop = useCallback(() => {
    runningRef.current = false;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const start = useCallback((ratio) => {
    const r = METRONOME_RATIOS[ratio];
    if (!r) return;
    stop();
    runningRef.current = true;

    // Prototypes are cloned per beat: cloning resets playback to the
    // start without re-fetching the file.
    const click = new Audio(CLICK_BEAT);
    const vent = new Audio(VENT_BEAT);
    const beat = (proto, delayMs) => {
      timersRef.current.push(setTimeout(() => {
        if (!runningRef.current) return;
        const a = proto.cloneNode(true);
        a.play().catch(() => {});
      }, delayMs));
    };

    const cycle = () => {
      if (!runningRef.current) return;
      for (let i = 0; i < r.compressions; i++) {
        beat(click, i * CLICK_BEAT_MS);
      }
      const ventStart = r.compressions * CLICK_BEAT_MS + 50;
      for (let j = 0; j < r.ventilations; j++) {
        beat(vent, ventStart + j * VENT_BEAT_MS);
      }
      const cycleMs = ventStart + r.ventilations * VENT_BEAT_MS + 50;
      timersRef.current.push(setTimeout(cycle, cycleMs));
    };
    cycle();
  }, [stop]);

  // Never leave the metronome running after unmount
  useEffect(() => stop, [stop]);

  return { start, stop };
}
