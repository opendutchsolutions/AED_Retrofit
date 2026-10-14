import { useRef, useCallback } from 'react';

export function useAudio() {
  const audioRef = useRef(null);

  const play = useCallback((src) => {
    if (!src) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const a = new Audio(src);
    audioRef.current = a;
    a.play().catch(() => {});
    return a;
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  // Pause the scenario audio without losing its position; returns true
  // when there is a paused, resumable main track (so an overlay can
  // restore it once it finishes).
  const pauseMain = useCallback(() => {
    const a = audioRef.current;
    if (!a || a.ended) return false;
    if (!a.paused) a.pause();
    return true;
  }, []);

  // Resume the scenario audio from where pauseMain() stopped it. No-op
  // when the main track was replaced or stopped in the meantime.
  const resumeMain = useCallback(() => {
    const a = audioRef.current;
    if (a && a.paused && !a.ended) {
      a.play().catch(() => {});
    }
  }, []);

  // Independent channel for announcements (e.g. kindsleutel activated):
  // interrupts the scenario prompt and can restore it on completion via
  // the optional onEnded callback.
  const overlayRef = useRef(null);
  const playOverlay = useCallback((src, onEnded) => {
    if (!src) return;
    if (overlayRef.current) {
      overlayRef.current.pause();
      overlayRef.current = null;
    }
    const a = new Audio(src);
    overlayRef.current = a;
    if (onEnded) {
      a.addEventListener('ended', () => {
        if (overlayRef.current === a) onEnded();
      }, { once: true });
    }
    a.play().catch(() => {});
    return a;
  }, []);
  const stopOverlay = useCallback(() => {
    if (overlayRef.current) {
      overlayRef.current.pause();
      overlayRef.current = null;
    }
  }, []);

  return { play, stop, pauseMain, resumeMain, playOverlay, stopOverlay };
}
