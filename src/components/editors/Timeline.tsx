import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useRef, useMemo } from 'react';
import { Colors } from '@/src/constants/colors';
import { useEditorStore } from '@/src/stores/editorStore';
import { useHaptics } from '@/src/hooks/useHaptics';

const { width } = Dimensions.get('window');
const PIXELS_PER_SECOND = 30;

interface TimelineProps {
  duration: number;
}

export function Timeline({ duration }: TimelineProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const { playbackPosition, setPlaybackPosition, silenceSegments } = useEditorStore();
  const haptics = useHaptics();

  const timelineWidth = Math.max(width, duration * PIXELS_PER_SECOND);
  const playheadPosition = playbackPosition * PIXELS_PER_SECOND;

  // Memoize waveform bars so heights don't change on every render
  const waveformBars = useMemo(() => {
    const count = Math.min(Math.floor(duration * 4), 300);
    return Array.from({ length: count }, () => 20 + Math.random() * 40);
  }, [duration]);

  const handleTimelinePress = (event: { nativeEvent: { locationX: number } }) => {
    const x = event.nativeEvent.locationX;
    const time = x / PIXELS_PER_SECOND;
    setPlaybackPosition(Math.max(0, Math.min(duration, time)));
    haptics.selection();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.timeDisplay}>
        <Text style={styles.timeText}>{formatTime(playbackPosition)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ width: timelineWidth }}
      >
        <TouchableOpacity
          style={[styles.timeline, { width: timelineWidth }]}
          onPress={handleTimelinePress}
          activeOpacity={1}
        >
          {/* Waveform */}
          <View style={styles.waveformContainer}>
            {waveformBars.map((barHeight, i) => (
              <View
                key={i}
                style={[
                  styles.waveformBar,
                  {
                    height: barHeight,
                    backgroundColor:
                      i * 0.25 < playbackPosition
                        ? Colors.waveformActive
                        : Colors.border,
                  },
                ]}
              />
            ))}
          </View>

          {/* Silence markers */}
          {silenceSegments.map((segment, index) => (
            <View
              key={index}
              style={[
                styles.silenceMarker,
                {
                  left: segment.start * PIXELS_PER_SECOND,
                  width: segment.duration * PIXELS_PER_SECOND,
                  backgroundColor: segment.excluded ? Colors.border : Colors.silenceMarker,
                },
              ]}
            />
          ))}

          {/* Playhead */}
          <View style={[styles.playhead, { left: playheadPosition }]} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: 12,
  },
  timeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  timeText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  timeline: {
    height: 60,
    position: 'relative',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: 8,
    gap: 2,
  },
  waveformBar: {
    width: 2,
    borderRadius: 1,
  },
  silenceMarker: {
    position: 'absolute',
    top: 0,
    height: '100%',
    opacity: 0.5,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: '100%',
    backgroundColor: Colors.primary,
  },
});
