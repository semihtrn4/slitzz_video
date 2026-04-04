import { useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';

interface UseAudioPlayerReturn {
  loadTrack(path: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  setVolume(volume: number): Promise<void>;
  unload(): Promise<void>;
  isPlaying: boolean;
}

interface UseAudioPlayerOptions {
  isPremium: boolean;
}

export function useAudioPlayer({ isPremium }: UseAudioPlayerOptions): UseAudioPlayerReturn {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const trackIndexRef = useRef(0);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const loadTrack = async (path: string): Promise<void> => {
    trackIndexRef.current += 1;

    if (!isPremium && trackIndexRef.current > 1) {
      throw new Error('Free plan: only the first track can be loaded. Upgrade to premium for unlimited tracks.');
    }

    // Unload previous sound if any
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    const { sound } = await Audio.Sound.createAsync({ uri: path });

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded) {
        setIsPlaying(status.isPlaying);
      }
    });

    soundRef.current = sound;
  };

  const play = async (): Promise<void> => {
    if (!soundRef.current) return;
    await soundRef.current.playAsync();
  };

  const pause = async (): Promise<void> => {
    if (!soundRef.current) return;
    await soundRef.current.pauseAsync();
  };

  const stop = async (): Promise<void> => {
    if (!soundRef.current) return;
    await soundRef.current.stopAsync();
  };

  const setVolume = async (volume: number): Promise<void> => {
    if (!soundRef.current) return;
    await soundRef.current.setVolumeAsync(volume / 100);
  };

  const unload = async (): Promise<void> => {
    if (!soundRef.current) return;
    await soundRef.current.unloadAsync();
    soundRef.current = null;
    setIsPlaying(false);
  };

  return { loadTrack, play, pause, stop, setVolume, unload, isPlaying };
}
