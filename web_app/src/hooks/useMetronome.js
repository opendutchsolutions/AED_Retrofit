import { useCallback, useEffect, useRef } from 'react';

// Single cropped beats, scheduled individually so the ratio is exact
const CLICK_BEAT = 'audio/metronome_click.wav';      // one compression click
const VENT_BEAT = 'audio/ventilation_beat.wav';      // one ventilation tone
const VENT_PROMPT = 'audio/ventilate_prompt.mp3';    // "ventileren op het ritme" announcement
const VENT_PROMPT_MS = 2150;
// The compression rounds are announced with the CPR voice prompt
// (7_CPR.wav, "start met reanimatie…", 2.55 s)
const CPR_PROMPT = 'audio/Nederlands/7_CPR.wav';
const CPR_PROMPT_MS = 2550;
const CPR_PROMPT_GAP_MS = 300;
// Compression cadence: 110/min per the reanimation guideline
const CLICK_BEAT_MS = 60000 / 110;
// Ventilation pace: a tone per ventilation, with a little air in between
const VENT_BEAT_MS = 1800;
// After the step's spoken CPR prompt finishes, give the student a few
// seconds to get in position before the first compression click
const START_DELAY_MS = 5000;
// Breathing space between the ventilation announcement and the first
// tone, and between the last ventilation and the next cycle's clicks
const VENT_PROMPT_GAP_MS = 400;
const CYCLE_REPOSITION_MS = 50;

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
  const ratioRef = useRef(null);

  const stop = useCallback(() => {
    runningRef.current = false;
    ratioRef.current = null;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const start = useCallback((ratio) => {
    const r = METRONOME_RATIOS[ratio];
    if (!r) return;
    // Idempotent: re-invoking with the ratio that is already running
    // must never stack a second scheduler on top of the first.
    if (runningRef.current && ratioRef.current === ratio) return;
    stop();
    runningRef.current = true;
    ratioRef.current = ratio;

    // Prototypes are cloned per beat: cloning resets playback to the
    // start without re-fetching the file. They are preloaded (and once
    // played muted) so the first audible clone starts instantly.
    const click = new Audio(CLICK_BEAT);
    const vent = new Audio(VENT_BEAT);
    const prompt = new Audio(VENT_PROMPT);
    click.preload = vent.preload = prompt.preload = 'auto';
    click.load();
    vent.load();
    prompt.load();
    const warm = (a) => {
      const w = a.cloneNode(true);
      w.muted = true;
      w.play().catch(() => {});
    };
    warm(click);
    warm(vent);
    warm(prompt);

    const beat = (proto, delayMs) => {
      timersRef.current.push(setTimeout(() => {
        if (!runningRef.current) return;
        const a = proto.cloneNode(true);
        a.play().catch(() => {});
      }, delayMs));
    };

    const cprPrompt = new Audio(CPR_PROMPT);
    cprPrompt.preload = 'auto';
    cprPrompt.load();
    warm(cprPrompt);

    // `announce` plays the CPR voice prompt before the clicks — used on
    // every cycle except the first, where the step's own audio just
    // played the prompt.
    const cycle = (announce) => {
      if (!runningRef.current) return;
      const clickStart = announce ? CPR_PROMPT_MS + CPR_PROMPT_GAP_MS : 0;
      if (announce) {
        beat(cprPrompt, 0);
      }
      for (let i = 0; i < r.compressions; i++) {
        beat(click, clickStart + i * CLICK_BEAT_MS);
      }
      // The ventilations are announced by a voice prompt first; the
      // ventilation tones start once it has finished.
      const ventStart = clickStart + r.compressions * CLICK_BEAT_MS + 50;
      beat(prompt, ventStart);
      const ventBeatsStart =
        ventStart + VENT_PROMPT_MS + VENT_PROMPT_GAP_MS;
      for (let j = 0; j < r.ventilations; j++) {
        beat(vent, ventBeatsStart + j * VENT_BEAT_MS);
      }
      // Room to move back to the chest before the next round
      const cycleMs =
        ventBeatsStart + r.ventilations * VENT_BEAT_MS + CYCLE_REPOSITION_MS;
      timersRef.current.push(setTimeout(() => cycle(true), cycleMs));
    };
    // First cycle: wait for the step's spoken CPR prompt + positioning time
    timersRef.current.push(setTimeout(() => cycle(false), START_DELAY_MS));
  }, [stop]);

  // Never leave the metronome running after unmount
  useEffect(() => stop, [stop]);

  return { start, stop };
}
