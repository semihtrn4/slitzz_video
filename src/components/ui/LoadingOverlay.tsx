import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Colors } from '@/src/constants/colors';
import type { ProcessingStep } from '@/src/types';

interface LoadingOverlayProps {
  visible: boolean;
  progress: number;
  step: ProcessingStep;
}

const STEP_LABELS: Record<ProcessingStep, string> = {
  idle: 'Ready',
  'extracting-audio': 'Extracting audio...',
  'detecting-silences': 'Detecting silences...',
  transcribing: 'Transcribing...',
  'generating-subtitles': 'Generating subtitles...',
  'applying-cuts': 'Applying cuts...',
  'burning-subtitles': 'Burning subtitles...',
  encoding: 'Encoding video...',
  exporting: 'Exporting...',
  complete: 'Complete!',
  error: 'Error occurred',
};

export function LoadingOverlay({ visible, progress, step }: LoadingOverlayProps) {
  if (!visible) return null;

  const percentage = Math.round(progress * 100);

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.container}>
      <BlurView intensity={80} style={styles.blur}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.stepText}>{STEP_LABELS[step]}</Text>
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${percentage}%` }]} />
          </View>
          <Text style={styles.percentage}>{percentage}%</Text>
        </View>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  blur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  content: {
    alignItems: 'center',
    padding: 32,
  },
  stepText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 20,
    marginBottom: 20,
  },
  progressContainer: {
    width: 200,
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  percentage: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 12,
  },
});
