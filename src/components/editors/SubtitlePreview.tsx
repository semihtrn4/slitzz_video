import { Text, View, StyleSheet, type ViewStyle } from 'react-native';
import Animated, { FadeIn, SlideInUp } from 'react-native-reanimated';
import type { SubtitleStyle, SubtitleSegment } from '@/src/types';

interface SubtitlePreviewProps {
  text: string;
  style: SubtitleStyle;
  segment?: SubtitleSegment;
  playbackPosition?: number;
}

// Karaoke highlight color
const KARAOKE_ACTIVE_COLOR = '#FCD34D';

/**
 * Determines the index of the currently active word for karaoke mode.
 *
 * If `segment.words` (WordTimestamp[]) is available, uses word-level timestamps.
 * Otherwise falls back to proportional highlighting based on position within segment duration.
 */
function getActiveWordIndex(
  words: string[],
  segment: SubtitleSegment | undefined,
  playbackPosition: number
): number {
  if (!segment) return -1;

  const { start, end, words: wordTimestamps } = segment;

  // Use word-level timestamps when available
  if (wordTimestamps && wordTimestamps.length > 0) {
    for (let i = 0; i < wordTimestamps.length; i++) {
      const wt = wordTimestamps[i];
      if (playbackPosition >= wt.start && playbackPosition < wt.end) {
        return i;
      }
    }
    // If past the last word's end, highlight the last word
    if (playbackPosition >= wordTimestamps[wordTimestamps.length - 1].end) {
      return wordTimestamps.length - 1;
    }
    return -1;
  }

  // Fallback: proportional highlighting based on position within segment duration
  const duration = end - start;
  if (duration <= 0 || words.length === 0) return -1;

  const elapsed = playbackPosition - start;
  if (elapsed < 0) return -1;

  const progress = elapsed / duration; // 0..1
  const index = Math.floor(progress * words.length);
  return Math.min(index, words.length - 1);
}

export function SubtitlePreview({ text, style, segment, playbackPosition = 0 }: SubtitlePreviewProps) {
  const getAnimation = () => {
    switch (style.animation) {
      case 'pop':
        return FadeIn;
      case 'slideUp':
        return SlideInUp;
      case 'fade':
        return FadeIn;
      default:
        return FadeIn;
    }
  };

  const getPosition = (): ViewStyle => {
    switch (style.position) {
      case 'top':
        return { top: 40 };
      case 'middle':
        return { top: '40%' as `${number}%` };
      case 'bottom':
      default:
        return { bottom: 60 };
    }
  };

  const getTextStyle = () => {
    const baseStyle: any = {
      fontSize: style.fontSize,
      fontWeight: style.bold ? 'bold' : 'normal',
      color: style.textColor,
      textAlign: 'center',
      textShadowColor: style.outline ? style.outlineColor : 'transparent',
      textShadowOffset: style.outline ? { width: 1, height: 1 } : undefined,
      textShadowRadius: style.outline ? 2 : undefined,
    };

    if (style.preset === 'netflix') {
      return {
        ...baseStyle,
        backgroundColor: `${style.backgroundColor}${Math.round(style.backgroundOpacity * 255).toString(16).padStart(2, '0')}`,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
      };
    }

    if (style.preset === 'tiktok') {
      return {
        ...baseStyle,
        textShadowColor: '#000000',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 4,
      };
    }

    if (style.preset === 'neon') {
      return {
        ...baseStyle,
        textShadowColor: style.outlineColor,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
      };
    }

    return baseStyle;
  };

  const AnimationComponent = getAnimation();

  // --- Karaoke rendering ---
  if (style.preset === 'karaoke') {
    const words = text.split(' ');
    const activeIndex = getActiveWordIndex(words, segment, playbackPosition);

    const baseWordStyle: any = {
      fontSize: style.fontSize,
      fontWeight: style.bold ? 'bold' : 'normal',
      color: style.textColor,
      // NOTE: @shopify/react-native-skia can be used here for a proper GPU glow effect
      // when the package is available. For now we use textShadow as a simple glow fallback.
      textShadowColor: 'transparent',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 0,
    };

    const activeWordStyle: any = {
      ...baseWordStyle,
      color: KARAOKE_ACTIVE_COLOR,
      // Simple glow via textShadow — replace with Skia Canvas glow when @shopify/react-native-skia is available
      textShadowColor: KARAOKE_ACTIVE_COLOR,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 8,
      transform: [{ scale: 1.08 }],
    };

    return (
      <Animated.View entering={AnimationComponent} style={[styles.container, getPosition()]}>
        <View style={styles.karaokeRow}>
          {words.map((word, index) => (
            <Text
              key={`${word}-${index}`}
              style={index === activeIndex ? activeWordStyle : baseWordStyle}
            >
              {word}{index < words.length - 1 ? ' ' : ''}
            </Text>
          ))}
        </View>
      </Animated.View>
    );
  }

  // --- Default rendering for all other presets ---
  return (
    <Animated.View entering={AnimationComponent} style={[styles.container, getPosition()]}>
      <Text style={getTextStyle()}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  karaokeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
