import { useRef, useCallback } from 'react';

export function useAudio() {
  const audioRef = useRef(null);
  const sinkRef = useRef(null);

  const play = useCallback((src) => {
    if (!src) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const a = new Audio(src);
    audioRef.current = a;
    if (sinkRef.current && typeof a.setSinkId === 'function') {
      a.setSinkId(sinkRef.current)
        .then(() => a.play())
        .catch(() => { a.play().catch(() => {}); });
    } else {
      a.play().catch(() => {});
    }
    return a;
  }, []);

  // Route all audio to a specific output device (e.g. the AED trainer's
  // Bluetooth Classic audio connection). Pass null/'' for the system default.
  const setSink = useCallback((deviceId) => {
    sinkRef.current = deviceId || null;
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  return { play, stop, setSink };
}
