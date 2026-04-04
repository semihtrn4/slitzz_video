import { useSubscriptionStore } from '../stores/subscriptionStore';
import { FREE_PLAN_LIMITS } from '../constants/exportPresets';

export function useSubscription() {
  const {
    isPremium,
    plan,
    canCreateProject,
    canExportDuration,
    canUseSubtitleStyle,
    canRemoveSilence,
    canUseBackgroundMusic,
    canExport4K,
    hasWatermark,
  } = useSubscriptionStore();

  return {
    isPremium,
    plan,
    freeLimits: FREE_PLAN_LIMITS,
    canCreateProject,
    canExportDuration,
    canUseSubtitleStyle,
    canRemoveSilence,
    canUseBackgroundMusic,
    canExport4K,
    hasWatermark,
  };
}
