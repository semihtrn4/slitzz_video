import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Resolution, AspectRatio } from '../types';

interface SettingsState {
  hapticEnabled: boolean;
  autoDownloadModel: boolean;
  defaultResolution: Resolution;
  defaultAspectRatio: AspectRatio;
  setHapticEnabled: (v: boolean) => void;
  setAutoDownloadModel: (v: boolean) => void;
  setDefaultResolution: (v: Resolution) => void;
  setDefaultAspectRatio: (v: AspectRatio) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      hapticEnabled: true,
      autoDownloadModel: false,
      defaultResolution: '1080p',
      defaultAspectRatio: '9:16',
      setHapticEnabled: (v) => set({ hapticEnabled: v }),
      setAutoDownloadModel: (v) => set({ autoDownloadModel: v }),
      setDefaultResolution: (v) => set({ defaultResolution: v }),
      setDefaultAspectRatio: (v) => set({ defaultAspectRatio: v }),
    }),
    {
      name: 'blitzcut-settings',
      storage: {
        getItem: async (name) => {
          const value = await AsyncStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: async (name, value) => {
          await AsyncStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: async (name) => {
          await AsyncStorage.removeItem(name);
        },
      },
    }
  )
);
