import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  Scissors,
  Type,
  Music,
  Settings,
} from 'lucide-react-native';

import { Colors } from '@/src/constants/colors';

export type EditorTab = 'silence' | 'subtitles' | 'audio' | 'adjust';

interface ToolBarProps {
  activeTab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
}

const TABS = [
  { id: 'silence' as EditorTab, label: 'Silence', icon: Scissors },
  { id: 'subtitles' as EditorTab, label: 'Subtitles', icon: Type },
  { id: 'audio' as EditorTab, label: 'Audio', icon: Music },
  { id: 'adjust' as EditorTab, label: 'Adjust', icon: Settings },
];

export function ToolBar({ activeTab, onTabChange }: ToolBarProps) {
  return (
    <View style={styles.container}>
      <View style={styles.scrollContent}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onTabChange(tab.id)}
              activeOpacity={0.7}
            >
              <Icon
                size={20}
                color={isActive ? Colors.primary : Colors.textSecondary}
              />
              <Text
                style={[styles.tabLabel, isActive && styles.tabLabelActive]}
              >
                {tab.label}
              </Text>
              {isActive && (
                <Animated.View
                  entering={FadeIn}
                  style={styles.activeIndicator}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  scrollContent: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    justifyContent: 'space-around',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
  },
  tabActive: {
    backgroundColor: `${Colors.primary}20`,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  tabLabelActive: {
    color: Colors.primary,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 16,
    height: 3,
    backgroundColor: Colors.primary,
    borderRadius: 1.5,
  },
});
