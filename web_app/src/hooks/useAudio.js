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

  return { play, stop };
}
