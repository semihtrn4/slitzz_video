import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '../stores/settingsStore';

export function useHaptics() {
  const hapticEnabled = useSettingsStore((s) => s.hapticEnabled);

  const selection = () => {
    if (!hapticEnabled) return;
    Haptics.selectionAsync();
  };

  const impact = (style: Haptics.ImpactFeedbackStyle) => {
    if (!hapticEnabled) return;
    Haptics.impactAsync(style);
  };

  const notification = (type: Haptics.NotificationFeedbackType) => {
    if (!hapticEnabled) return;
    Haptics.notificationAsync(type);
  };

  return { selection, impact, notification };
}
