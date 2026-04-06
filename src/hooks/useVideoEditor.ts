import { useCallback } from 'react';
import { ImpactFeedbackStyle, NotificationFeedbackType } from 'expo-haptics';
import { useRouter } from 'expo-router';

import * as MediaLibrary from 'expo-media-library';
import { useEditorStore } from '../stores/editorStore';
import { useProjectStore } from '../stores/projectStore';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { ffmpegService } from '../services/ffmpegService';
import { transcriptionService } from '../services/transcriptionService';
import { silenceService } from '../services/silenceService';
import { useHaptics } from './useHaptics';
import { useToast } from './useToast';
import type { Project, LanguageCode, ExportConfig } from '../types';

export function useVideoEditor(project: Project) {
  const router = useRouter();
  const { isUserPremium, canRemoveSilence } = useSubscriptionStore();
  const hasPremium = isUserPremium();
  const { updateProject } = useProjectStore();
  const haptics = useHaptics();
  const toast = useToast();
  
  const {
    silenceSegments,
    setSilenceSegments,
    silenceSettings,
    setSubtitleSegments,
    isProcessing,
    setProcessing,
    processingProgress,
    setProcessingProgress,
    processingStep,
    setProcessingStep,
  } = useEditorStore();

  const detectSilences = useCallback(async () => {
    if (!hasPremium && !canRemoveSilence(project.duration)) {
      toast.show('Silence removal for videos longer than 30s requires Premium.', 'info');
      router.push('/paywall');
      return;
    }

    setProcessing(true);
    setProcessingStep('detecting-silences');
    setProcessingProgress(0);

    try {
      // Extract audio first
      setProcessingStep('extracting-audio');
      const audioPath = await ffmpegService.extractAudio(project.originalVideoPath);
      
      setProcessingStep('detecting-silences');
      const segments = await ffmpegService.detectSilences(
        audioPath,
        silenceSettings.threshold,
        silenceSettings.minDuration
      );
      
      setSilenceSegments(segments);
      
      if (segments.length === 0) {
        toast.show('No silent segments were detected in this video.', 'info');
      } else {
        haptics.impact(ImpactFeedbackStyle.Medium);
      }
    } catch (error) {
      console.error('Error detecting silences:', error);
      toast.show('Failed to detect silences', 'error');
    } finally {
      setProcessing(false);
      setProcessingStep('idle');
    }
  }, [project, silenceSettings, hasPremium, canRemoveSilence, router, setSilenceSegments, setProcessing, setProcessingProgress, setProcessingStep]);

  const applySilenceRemoval = useCallback(async () => {
    const keepSegments = silenceService.computeKeepSegments(
      project.duration,
      silenceSegments,
      silenceSettings.padding
    );

    setProcessing(true);
    setProcessingStep('applying-cuts');
    setProcessingProgress(0);

    try {
      const outputPath = await ffmpegService.removeSilences(
        project.originalVideoPath,
        keepSegments,
        silenceSettings.padding
      );

      updateProject(project.id, {
        processedVideoPath: outputPath,
      });

      toast.show('Silences removed successfully!', 'success');
    } catch (error) {
      console.error('Error removing silences:', error);
      toast.show('Failed to remove silences', 'error');
    } finally {
      setProcessing(false);
      setProcessingStep('idle');
    }
  }, [project, silenceSegments, silenceSettings, setProcessing, setProcessingProgress, setProcessingStep, updateProject]);

  const transcribe = useCallback(async (language: LanguageCode) => {
    setProcessing(true);
    setProcessingStep('extracting-audio');
    setProcessingProgress(0);

    try {
      // Check and download model if needed
      const hasModel = await transcriptionService.isModelDownloaded();
      if (!hasModel) {
        await transcriptionService.downloadModel((progress) => {
          setProcessingProgress(progress * 0.5);
        });
      }

      // Extract audio (using WAV for Whisper)
      setProcessingStep('extracting-audio');
      const audioPath = await ffmpegService.extractAudio(
        project.processedVideoPath || project.originalVideoPath,
        true // forWhisper
      );

      // Transcribe
      setProcessingStep('transcribing');
      const segments = await transcriptionService.transcribe(
        audioPath,
        language,
        (step) => {
          setProcessingStep(step as any);
        }
      );

      setSubtitleSegments(segments);
      setProcessingStep('complete');
    } catch (error) {
      console.error('Error transcribing:', error);
      toast.show('Failed to transcribe audio', 'error');
    } finally {
      setProcessing(false);
      setProcessingStep('idle');
    }
  }, [project, setSubtitleSegments, setProcessing, setProcessingProgress, setProcessingStep]);

  const exportVideo = useCallback(async (config: ExportConfig) => {
    haptics.notification(NotificationFeedbackType.Success);
    setProcessing(true);
    setProcessingStep('encoding');
    setProcessingProgress(0);

    try {
      if (config.includeSubtitles) {
        const { subtitleSegments, subtitleStyle } = useEditorStore.getState();
        if (subtitleSegments.length > 0) {
          setProcessingStep('generating-subtitles');
          
          let adjustedSegments = subtitleSegments;
          // [Note] TranscriptionService already splits segments into 1-2 words since the last update.

          if (config.trimStart && config.trimStart > 0) {
            adjustedSegments = adjustedSegments
              .filter(seg => seg.end > config.trimStart!)
              .map(seg => ({
                ...seg,
                start: Math.max(0, seg.start - config.trimStart!),
                end: seg.end - config.trimStart!,
              }));
          }

          // Generate professional ASS subtitles instead of SRT
          config.srtPath = await transcriptionService.generateASS(
            adjustedSegments, 
            subtitleStyle,
            { width: 1080, height: 1920 } // Base resolution for style scaling
          );
          config.subtitleStyle = subtitleStyle;
        }
      }

      const outputPath = await ffmpegService.exportVideo(config, hasPremium, (progress, step) => {
        setProcessingProgress(progress);
        setProcessingStep(step as any);
      });

      updateProject(project.id, {
        processedVideoPath: outputPath,
        status: 'exported',
      });

      // --- Save to Gallery (Camera Roll) ---
      setProcessingStep('saving' as any);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        await MediaLibrary.saveToLibraryAsync(outputPath);
        console.log('[MediaLibrary] Saved to gallery successfully');
      } else {
        console.warn('[MediaLibrary] Permission denied, skipping gallery save');
      }

      setProcessingStep('complete' as any);
      haptics.notification(NotificationFeedbackType.Success);
      return outputPath;
    } catch (error: any) {
      console.error('Error exporting video:', error);
      if (error?.message === 'FREE_PLAN_DURATION_EXCEEDED') {
        router.push('/paywall');
      } else {
        toast.show('Failed to export video', 'error');
      }
      return null;
    } finally {
      setProcessing(false);
    }
  }, [project, hasPremium, router, setProcessing, setProcessingProgress, setProcessingStep, updateProject]);

  const seekToTime = useCallback((time: number) => {
    useEditorStore.getState().setPlaybackPosition(time);
    haptics.selection();
  }, [haptics]);

  return {
    detectSilences,
    applySilenceRemoval,
    transcribe,
    exportVideo,
    seekToTime,
    isProcessing,
    processingProgress,
    processingStep,
  };
}
