"use client";

import { useEffect, useRef, useState } from "react";

export function useAudioPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    audioRef.current = null;
    setPlayingId(null);
  };

  const play = async (id: string, src: string) => {
    stop();
    setAudioError(null);
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.onended = stop;
    audio.onerror = () => {
      stop();
      setAudioError("Preview unavailable — you can still choose this assistant.");
    };
    try {
      await audio.play();
      setPlayingId(id);
    } catch {
      setAudioError("Preview unavailable — you can still choose this assistant.");
    }
  };

  useEffect(() => stop, []);
  return { play, stop, playingId, audioError };
}
