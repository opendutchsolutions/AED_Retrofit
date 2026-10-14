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

  // Independent channel for announcements (e.g. kindsleutel activated):
  // plays alongside the scenario prompt instead of replacing it.
  const overlayRef = useRef(null);
  const playOverlay = useCallback((src) => {
    if (!src) return;
    if (overlayRef.current) {
      overlayRef.current.pause();
      overlayRef.current = null;
    }
    const a = new Audio(src);
    overlayRef.current = a;
    a.play().catch(() => {});
    return a;
  }, []);
  const stopOverlay = useCallback(() => {
    if (overlayRef.current) {
      overlayRef.current.pause();
      overlayRef.current = null;
    }
  }, []);

  return { play, stop, playOverlay, stopOverlay };
}
