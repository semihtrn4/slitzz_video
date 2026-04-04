import { View, Text, StyleSheet, PanResponder } from 'react-native';
import { useRef, useCallback } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Colors } from '@/src/constants/colors';

interface SliderProps {
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  onValueChange: (value: number) => void;
  label?: string;
  formatValue?: (value: number) => string;
}

export function Slider({
  value,
  minimumValue,
  maximumValue,
  step = 1,
  onValueChange,
  label,
  formatValue = (v) => String(v),
}: SliderProps) {
  const trackWidth = useRef(0);
  const position = useSharedValue(0);
  const progress = (value - minimumValue) / (maximumValue - minimumValue);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: position.value,
  }));

  const calculateValue = useCallback((x: number) => {
    const ratio = x / trackWidth.current;
    const rawValue = minimumValue + ratio * (maximumValue - minimumValue);
    const steppedValue = Math.round(rawValue / step) * step;
    return Math.max(minimumValue, Math.min(maximumValue, steppedValue));
  }, [minimumValue, maximumValue, step]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const x = evt.nativeEvent.locationX;
        position.value = withSpring(Math.max(0, Math.min(x, trackWidth.current)));
        onValueChange(calculateValue(x));
      },
      onPanResponderMove: (evt) => {
        const x = evt.nativeEvent.locationX;
        position.value = Math.max(0, Math.min(x, trackWidth.current));
        onValueChange(calculateValue(x));
      },
      onPanResponderRelease: (evt) => {
        const x = evt.nativeEvent.locationX;
        position.value = withSpring(Math.max(0, Math.min(x, trackWidth.current)));
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      {label && (
        <View style={styles.header}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{formatValue(value)}</Text>
        </View>
      )}
      <View
        style={styles.trackContainer}
        onLayout={(e) => {
          trackWidth.current = e.nativeEvent.layout.width;
          position.value = progress * e.nativeEvent.layout.width;
        }}
        {...panResponder.panHandlers}
      >
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillStyle]} />
        </View>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  value: {
    fontSize: 15,
    color: Colors.primary,
    fontWeight: '600',
  },
  trackContainer: {
    height: 24,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    left: -10,
  },
});
