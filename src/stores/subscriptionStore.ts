import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlanType } from '../types';
import { FREE_PLAN_LIMITS } from '../constants/exportPresets';

interface SubscriptionState {
  isPremium: boolean;
  debugProMode: boolean;
  plan: PlanType;
  setPremium: (isPremium: boolean) => void;
  setDebugProMode: (enabled: boolean) => void;
  setPlan: (plan: PlanType) => void;
  togglePremium: () => void;
  toggleDebugProMode: () => void;
  
  // Feature checks
  isUserPremium: () => boolean;
  canCreateProject: (currentCount: number) => boolean;
  canExportDuration: (duration: number) => boolean;
  canUseSubtitleStyle: (styleId: string) => boolean;
  canRemoveSilence: (duration: number) => boolean;
  canUseBackgroundMusic: () => boolean;
  canExport4K: () => boolean;
  hasWatermark: () => boolean;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      isPremium: false,
      debugProMode: false,
      plan: 'free',

      setPremium: (isPremium) => set({ isPremium }),
      setDebugProMode: (debugProMode) => set({ debugProMode }),
      setPlan: (plan) => set({ plan, isPremium: plan !== 'free' }),
      togglePremium: () => set((state) => ({ isPremium: !state.isPremium })),
      toggleDebugProMode: () => set((state) => ({ debugProMode: !state.debugProMode })),

      isUserPremium: () => {
        return get().isPremium || get().debugProMode;
      },

      canCreateProject: (currentCount) => {
        if (get().isUserPremium()) return true;
        return currentCount < FREE_PLAN_LIMITS.maxProjects;
      },

      canExportDuration: (duration) => {
        if (get().isUserPremium()) return true;
        return duration <= FREE_PLAN_LIMITS.maxExportDuration;
      },

      canUseSubtitleStyle: (styleId) => {
        if (get().isUserPremium()) return true;
        return FREE_PLAN_LIMITS.allowedSubtitleStyles.includes(styleId as any);
      },

      canRemoveSilence: (duration) => {
        if (get().isUserPremium()) return true;
        return duration <= FREE_PLAN_LIMITS.silenceRemovalMaxDuration;
      },

      canUseBackgroundMusic: () => {
        return get().isUserPremium() || FREE_PLAN_LIMITS.allowBackgroundMusic;
      },

      canExport4K: () => {
        return get().isUserPremium() || FREE_PLAN_LIMITS.allow4KExport;
      },

      hasWatermark: () => {
        if (get().isUserPremium()) return false;
        return FREE_PLAN_LIMITS.watermark;
      },
    }),
    {
      name: 'blitzcut-subscription',
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
