import * as FileSystem from 'expo-file-system/legacy';
import { silenceService } from './silenceService';
import type { SilenceSegment, TimeSegment, SubtitleStyle, ExportConfig } from '../types';

// ffmpeg-kit-react-native was retired in January 2025 and removed from Maven.
// All FFmpeg operations are mocked. Real implementation requires a custom native module.

export class FFmpegService {
  private static instance: FFmpegService;

  static getInstance(): FFmpegService {
    if (!FFmpegService.instance) {
      FFmpegService.instance = new FFmpegService();
    }
    return FFmpegService.instance;
  }

  async extractAudio(videoPath: string): Promise<string> {
    console.log('[FFmpeg] extractAudio (mock):', videoPath);
    // Return the video path itself — Whisper can handle video files directly in some implementations
    return videoPath;
  }

  async detectSilences(
    _audioPath: string,
    _threshold: number,
    _minDuration: number
  ): Promise<SilenceSegment[]> {
    console.log('[FFmpeg] detectSilences (mock)');
    // Return empty array — no silences detected in mock mode
    return [];
  }

  async removeSilences(
    videoPath: string,
    _keepSegments: TimeSegment[],
    _padding: number
  ): Promise<string> {
    console.log('[FFmpeg] removeSilences (mock)');
    return videoPath;
  }

  async burnSubtitles(
    videoPath: string,
    _srtPath: string,
    _style: SubtitleStyle
  ): Promise<string> {
    console.log('[FFmpeg] burnSubtitles (mock)');
    return videoPath;
  }

  async generateThumbnail(videoPath: string, _time: number = 0): Promise<string> {
    console.log('[FFmpeg] generateThumbnail (mock)');
    // Return empty string — no thumbnail in mock mode
    return '';
  }

  async exportVideo(
    config: ExportConfig,
    isPremium: boolean,
    onProgress?: (progress: number, step: string) => void
  ): Promise<string> {
    console.log('[FFmpeg] exportVideo (mock):', config);

    // Free plan duration guard still works
    if (!isPremium) {
      const info = await this.getVideoInfo(config.videoPath);
      const exportDuration = (config.trimEnd ?? info.duration) - (config.trimStart ?? 0);
      if (exportDuration > 60) {
        throw new Error('FREE_PLAN_DURATION_EXCEEDED');
      }
    }

    // Simulate export progress
    const steps = ['Analyzing', 'Processing', 'Encoding', 'Finalizing'];
    for (let i = 0; i < steps.length; i++) {
      onProgress?.((i + 1) / steps.length, steps[i]);
      await this.delay(300);
    }

    // Ensure exports directory exists
    const exportsDirUri = FileSystem.documentDirectory + 'exports/';
    const dirInfo = await FileSystem.getInfoAsync(exportsDirUri);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(exportsDirUri, { intermediates: true });
    }

    // In mock mode, just return the original video path
    onProgress?.(1, 'Done');
    return config.videoPath;
  }

  async getVideoInfo(_videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
  }> {
    console.log('[FFmpeg] getVideoInfo (mock)');
    return { duration: 60, width: 1080, height: 1920, fps: 30 };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const ffmpegService = FFmpegService.getInstance();
