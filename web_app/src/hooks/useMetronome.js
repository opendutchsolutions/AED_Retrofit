import { useCallback, useEffect, useRef } from 'react';

// Compression click track: 110/min per the reanimation guideline
const CLICK_TRACK = 'audio/click-track-110bpm.mp3';
const CLICK_BEAT_MS = 60000 / 110;
// Ventilation guidance rhythm: one ventilation per second
const VENT_TRACK = 'audio/ventilation_metronome.wav';
const VENT_BEAT_MS = 1000;

/** ratio label -> { compressions, ventilations } */
export const METRONOME_RATIOS = {
  '30:2': { compressions: 30, ventilations: 2 },
  '15:1': { compressions: 15, ventilations: 1 },
  '10:1': { compressions: 10, ventilations: 1 },
};

/**
 * CPR metronome: plays the compression click track for the ratio's
 * compression count, then the ventilation metronome for the ventilation
 * count, and repeats until stop() is called. During the ventilations the
 * click track is silent, so compressions and ventilations never overlap.
 */
export function useMetronome() {
  const clickRef = useRef(null);
  const ventRef = useRef(null);
  const timerRef = useRef(null);
  const runningRef = useRef(false);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (clickRef.current) { clickRef.current.pause(); clickRef.current = null; }
    if (ventRef.current) { ventRef.current.pause(); ventRef.current = null; }
  }, []);

  const start = useCallback((ratio) => {
    const r = METRONOME_RATIOS[ratio];
    if (!r) return;
    stop();
    runningRef.current = true;

    const click = new Audio(CLICK_TRACK);
    click.loop = true;
    const vent = new Audio(VENT_TRACK);
    vent.loop = true;
    clickRef.current = click;
    ventRef.current = vent;
    vent.muted = true;
    click.play().catch(() => {});
    vent.play().catch(() => {});
    // Both loops keep running; the scheduler only toggles which one is
    // audible, so the click track stays on beat within each cycle.

    const compressMs = r.compressions * CLICK_BEAT_MS;
    const ventMs = r.ventilations * VENT_BEAT_MS;
    const cycle = () => {
      if (!runningRef.current) return;
      click.muted = false;
      vent.muted = true;
      vent.currentTime = 0;
      timerRef.current = setTimeout(() => {
        if (!runningRef.current) return;
        click.muted = true;
        vent.muted = false;
        vent.currentTime = 0;
        timerRef.current = setTimeout(cycle, ventMs);
      }, compressMs);
    };
    cycle();
  }, [stop]);

  // Never leave the metronome running after unmount
  useEffect(() => stop, [stop]);

  return { start, stop };
}
