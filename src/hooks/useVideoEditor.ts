import { useCallback } from 'react';
import { Platform } from 'react-native';
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
import type { Project, LanguageCode, ExportConfig, ProcessingStep } from '../types';

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
      setProcessingStep('probing-video');
      const info = await ffmpegService.getVideoInfo(project.originalVideoPath);
      if (!info.hasAudio) {
        const raw = info.rawOutput || 'No probe output';
        console.warn('[DetectSilences] No audio. Probe:', raw);
        toast.show(`SES BULUNAMADI: Detect silences failed. Probe info: ${raw.substring(0, 100)}...`, 'error');
        return;
      }

      setProcessingStep('extracting-audio');
      // Silence detect için Whisper formatı (WAV 16kHz) gerekmez — m4a daha hızlı ve stabil
      const audioPath = await ffmpegService.extractAudio(project.originalVideoPath, false);

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
        toast.show(`${segments.length} silence(s) detected.`, 'success');
      }
    } catch (error: any) {
      console.error('Error detecting silences:', error);
      const msg = error?.message || String(error);
      toast.show(`Failed to detect silences: ${msg.substring(0, 150)}...`, 'error');
    } finally {
      setProcessing(false);
      setProcessingStep('idle');
    }
  // FIX #18: haptics ve toast dependency'lere eklendi
  }, [project, silenceSettings, hasPremium, canRemoveSilence, router, setSilenceSegments, setProcessing, setProcessingProgress, setProcessingStep, haptics, toast]);

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
        keepSegments
      );

      updateProject(project.id, {
        processedVideoPath: outputPath,
      });

      toast.show('Silences removed successfully!', 'success');
    } catch (error: any) {
      console.error('Error removing silences:', error);
      const msg = error?.message || String(error);
      toast.show(`Failed to remove silences: ${msg.substring(0, 150)}...`, 'error');
    } finally {
      setProcessing(false);
      setProcessingStep('idle');
    }
  }, [project, silenceSegments, silenceSettings, setProcessing, setProcessingProgress, setProcessingStep, updateProject, toast]);

  const transcribe = useCallback(async (language: LanguageCode) => {
    setProcessing(true);
    setProcessingStep('extracting-audio');
    setProcessingProgress(0);

    try {
      const videoPath = project.processedVideoPath || project.originalVideoPath;
      setProcessingStep('probing-video');

      // FFmpegKit native modülü yoksa hasAudio=true varsay, devam et
      let hasAudio = true;
      try {
        const info = await ffmpegService.getVideoInfo(videoPath);
        hasAudio = info.hasAudio;
      } catch (e) {
        console.warn('[Transcribe] getVideoInfo failed, assuming hasAudio=true:', e);
      }

      if (!hasAudio) {
        toast.show('Bu videoda transkribe edilecek ses bulunamadı. (No audio in probe)', 'error');
        return;
      }

      const hasModel = await transcriptionService.isModelDownloaded();
      if (!hasModel) {
        setProcessingStep('extracting-audio');
        await transcriptionService.downloadModel((progress) => {
          setProcessingProgress(progress * 0.7);
        });
      }

      setProcessingStep('extracting-audio');
      const audioPath = await ffmpegService.extractAudio(videoPath, true);

      setProcessingStep('transcribing');
      const segments = await transcriptionService.transcribe(
        audioPath,
        language,
        (step) => {
          const validSteps: ProcessingStep[] = [
            'idle', 'probing-video', 'extracting-audio', 'detecting-silences',
            'transcribing', 'generating-subtitles', 'applying-cuts',
            'burning-subtitles', 'encoding', 'exporting', 'complete', 'error'
          ];
          if (validSteps.includes(step as ProcessingStep)) {
            setProcessingStep(step as ProcessingStep);
          }
        }
      );

      setSubtitleSegments(segments);
      setProcessingStep('complete');
      toast.show('Transcription complete!', 'success');
    } catch (error) {
      console.error('Error transcribing:', error);
      const msg = (error as any)?.message || String(error);
      if (msg.includes('whisper.rn')) {
        toast.show('Whisper native modülü bulunamadı. Fiziksel cihaz ve native build gerekli.', 'error');
      } else if (msg.includes('model not downloaded') || msg.includes('Model not downloaded')) {
        toast.show('Whisper modeli indirilmedi. Ayarlar > AI bölümünden indirin.', 'error');
      } else if (msg.includes('no audio') || msg.includes('hasAudio')) {
        toast.show('Bu videoda ses yok.', 'error');
      } else if (msg.includes('getLogLevel') || msg.includes('FFmpeg')) {
        toast.show('FFmpeg native modülü hazır değil. Native build gerekli (expo run:ios/android).', 'error');
      } else {
        const fullMsg = (error as any)?.message || String(error);
        toast.show(`Transcribe hatası: ${fullMsg.substring(0, 150)}...`, 'error');
      }
    } finally {
      setProcessing(false);
      setProcessingStep('idle');
    }
  // FIX #18: toast dependency'e eklendi
  }, [project, setSubtitleSegments, setProcessing, setProcessingProgress, setProcessingStep, toast]);

  const exportVideo = useCallback(async (inputConfig: ExportConfig) => {
    haptics.notification(NotificationFeedbackType.Success);
    setProcessing(true);
    setProcessingStep('encoding');
    setProcessingProgress(0);

    // Relative path'li background music FFmpeg'i crash yapar, temizle
    let config: ExportConfig = (inputConfig.musicPath && !inputConfig.musicPath.startsWith('/'))
      ? { ...inputConfig, musicPath: undefined, musicVolume: undefined }
      : { ...inputConfig };

    try {
      if (config.includeSubtitles) {
        const { subtitleSegments, subtitleStyle } = useEditorStore.getState();
        if (subtitleSegments.length > 0) {
          setProcessingStep('generating-subtitles');

          let adjustedSegments = subtitleSegments;

          if (config.trimStart && config.trimStart > 0) {
            adjustedSegments = adjustedSegments
              .filter((seg) => seg.end > config.trimStart!)
              .map((seg) => ({
                ...seg,
                start: Math.max(0, seg.start - config.trimStart!),
                end: seg.end - config.trimStart!,
              }));
          }

          config.srtPath = await transcriptionService.generateASS(
            adjustedSegments,
            subtitleStyle,
            { width: 1080, height: 1920 }
          );
          config.subtitleStyle = subtitleStyle;
        }
      }

      const outputPath = await ffmpegService.exportVideo(config, hasPremium, (progress, step) => {
        setProcessingProgress(progress);
        const validSteps: ProcessingStep[] = [
          'idle', 'probing-video', 'extracting-audio', 'detecting-silences',
          'transcribing', 'generating-subtitles', 'applying-cuts',
          'burning-subtitles', 'encoding', 'exporting', 'complete', 'error'
        ];
        if (validSteps.includes(step as ProcessingStep)) {
          setProcessingStep(step as ProcessingStep);
        }
      });

      // FIX #6: outputPath null kontrolü — null ise hata fırlat
      if (!outputPath) {
        throw new Error('Export returned empty path');
      }

      updateProject(project.id, {
        processedVideoPath: outputPath,
        status: 'exported',
      });

      // FIX: iOS ham path (file:// prefix'siz), Android file:// prefix'li ister
      setProcessingStep('exporting');
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        const saveablePath = Platform.OS === 'ios'
          ? outputPath.replace('file://', '')
          : outputPath.startsWith('file://') ? outputPath : `file://${outputPath}`;
        await MediaLibrary.saveToLibraryAsync(saveablePath);
        console.log('[MediaLibrary] Saved to gallery successfully');
      } else {
        console.warn('[MediaLibrary] Permission denied, skipping gallery save');
        toast.show('Gallery permission denied. Video saved to app only.', 'warning');
      }

      setProcessingStep('complete');
      haptics.notification(NotificationFeedbackType.Success);
      return outputPath;
    } catch (error: any) {
      console.error('Error exporting video:', error);
      if (error?.message === 'FREE_PLAN_DURATION_EXCEEDED') {
        router.push('/paywall');
      } else {
        const fullMsg = (error as any)?.message || String(error);
        toast.show(`Export failed: ${fullMsg.substring(0, 300)}...`, 'error');
      }
      return null;
    } finally {
      setProcessing(false);
    }
  // FIX #18: haptics ve toast dependency'lere eklendi
  }, [project, hasPremium, router, setProcessing, setProcessingProgress, setProcessingStep, updateProject, haptics, toast]);

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
