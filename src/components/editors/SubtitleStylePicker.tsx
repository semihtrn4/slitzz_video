import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Colors } from '@/src/constants/colors';
import { Slider } from '../ui/Slider';
import type { SubtitleStyle } from '@/src/types';

interface SubtitleStylePickerProps {
  style: SubtitleStyle;
  onChange: (style: Partial<SubtitleStyle>) => void;
  isPremium: boolean;
  onUpgrade: () => void;
}

const PRESETS: { id: SubtitleStyle['preset']; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'netflix', label: 'Netflix' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'neon', label: 'Neon' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'karaoke', label: 'Karaoke' },
];

const TEXT_COLORS = [
  { value: '#FFFFFF', label: 'White' },
  { value: '#FCD34D', label: 'Yellow' },
  { value: '#22D3EE', label: 'Cyan' },
  { value: '#EF4444', label: 'Red' },
  { value: '#10B981', label: 'Green' },
  { value: '#000000', label: 'Black' },
];

const POSITIONS: { value: SubtitleStyle['position']; label: string }[] = [
  { value: 'top', label: 'Üst' },
  { value: 'middle', label: 'Orta' },
  { value: 'bottom', label: 'Alt' },
];

const ANIMATIONS: { value: SubtitleStyle['animation']; label: string }[] = [
  { value: 'none', label: 'Yok' },
  { value: 'pop', label: 'Pop' },
  { value: 'slideUp', label: 'Yukarı' },
  { value: 'fade', label: 'Fade' },
];

export function SubtitleStylePicker({
  style,
  onChange,
  isPremium,
  onUpgrade,
}: SubtitleStylePickerProps) {
  const handlePresetPress = (presetId: SubtitleStyle['preset']) => {
    const isLocked = !isPremium && presetId !== 'classic';
    if (isLocked) {
      onUpgrade();
    } else {
      onChange({ preset: presetId });
    }
  };

  return (
    <View style={styles.container}>
      {/* Preset List */}
      <Text style={styles.sectionLabel}>Stil</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.presetsRow}
      >
        {PRESETS.map((preset) => {
          const isLocked = !isPremium && preset.id !== 'classic';
          const isSelected = style.preset === preset.id;
          return (
            <TouchableOpacity
              key={preset.id}
              onPress={() => handlePresetPress(preset.id)}
              style={[styles.presetCard, isSelected && styles.presetCardSelected]}
              activeOpacity={0.7}
            >
              <Text style={[styles.presetLabel, isSelected && styles.presetLabelSelected]}>
                {preset.label}
              </Text>
              {isLocked && <Text style={styles.lockIcon}>🔒</Text>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Karaoke note */}
      {style.preset === 'karaoke' && (
        <View style={styles.karaokeNote}>
          <Text style={styles.karaokeNoteText}>🎵 Kelime bazlı vurgulama aktif</Text>
        </View>
      )}

      {/* Font Size Slider */}
      <View style={styles.section}>
        <Slider
          label="Yazı Boyutu"
          value={style.fontSize}
          minimumValue={14}
          maximumValue={48}
          step={1}
          onValueChange={(v) => onChange({ fontSize: v })}
          formatValue={(v) => `${v}pt`}
        />
      </View>

      {/* Text Color */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Renk</Text>
        <View style={styles.colorRow}>
          {TEXT_COLORS.map((color) => (
            <Pressable
              key={color.value}
              onPress={() => onChange({ textColor: color.value })}
              style={[
                styles.colorSwatch,
                { backgroundColor: color.value },
                style.textColor === color.value && styles.colorSwatchSelected,
                color.value === '#000000' && styles.colorSwatchDark,
              ]}
            />
          ))}
        </View>
      </View>

      {/* Position */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Konum</Text>
        <View style={styles.optionRow}>
          {POSITIONS.map((pos) => (
            <TouchableOpacity
              key={pos.value}
              onPress={() => onChange({ position: pos.value })}
              style={[styles.optionChip, style.position === pos.value && styles.optionChipSelected]}
            >
              <Text
                style={[
                  styles.optionChipText,
                  style.position === pos.value && styles.optionChipTextSelected,
                ]}
              >
                {pos.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Animation */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Animasyon</Text>
        <View style={styles.optionRow}>
          {ANIMATIONS.map((anim) => (
            <TouchableOpacity
              key={anim.value}
              onPress={() => onChange({ animation: anim.value })}
              style={[
                styles.optionChip,
                style.animation === anim.value && styles.optionChipSelected,
              ]}
            >
              <Text
                style={[
                  styles.optionChipText,
                  style.animation === anim.value && styles.optionChipTextSelected,
                ]}
              >
                {anim.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  presetsRow: {
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 4,
  },
  presetCard: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    minWidth: 80,
    gap: 4,
  },
  presetCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '22',
  },
  presetLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  presetLabelSelected: {
    color: Colors.primaryLight,
    fontWeight: '700',
  },
  lockIcon: {
    fontSize: 12,
  },
  karaokeNote: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: Colors.primary + '22',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.primary + '55',
  },
  karaokeNoteText: {
    fontSize: 13,
    color: Colors.accent,
    fontWeight: '500',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: Colors.primary,
    transform: [{ scale: 1.15 }],
  },
  colorSwatchDark: {
    borderColor: Colors.border,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  optionChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '22',
  },
  optionChipText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  optionChipTextSelected: {
    color: Colors.primaryLight,
    fontWeight: '700',
  },
});
