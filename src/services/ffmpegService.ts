import * as FileSystem from 'expo-file-system/legacy';
import { NativeModules } from 'react-native';
import { silenceService } from './silenceService';
import type { SilenceSegment, TimeSegment, SubtitleStyle, ExportConfig } from '../types';

// ffmpeg-kit-react-native requires native modules — not available in Expo Go
// Check native module presence BEFORE requiring the package
const ffmpegAvailable = !!NativeModules.FFmpegKitReactNativeModule;

let FFmpegKit: any = null;
let FFmpegKitConfig: any = null;
let ReturnCode: any = null;
let FFprobeKit: any = null;

if (ffmpegAvailable) {
  try {
    const mod = require('ffmpeg-kit-react-native');
    FFmpegKit = mod.FFmpegKit;
    FFmpegKitConfig = mod.FFmpegKitConfig;
    ReturnCode = mod.ReturnCode;
    FFprobeKit = mod.FFprobeKit;
  } catch {
    // still not available
  }
} else {
  console.warn('[FFmpeg] Native module not available (Expo Go). Use a physical device with npx expo prebuild.');
}

export class FFmpegService {
  private static instance: FFmpegService;

  static getInstance(): FFmpegService {
    if (!FFmpegService.instance) {
      FFmpegService.instance = new FFmpegService();
    }
    return FFmpegService.instance;
  }

  private requireFFmpeg(): void {
    if (!ffmpegAvailable) {
      throw new Error('[FFmpeg] Native module not available. Run npx expo prebuild and test on a physical device.');
    }
  }

  // Extract audio for Whisper transcription
  async extractAudio(videoPath: string): Promise<string> {
    console.log('[FFmpeg] Extracting audio from:', videoPath);
    this.requireFFmpeg();

    const tempDirUri = FileSystem.cacheDirectory + 'temp/';
    const dirInfo = await FileSystem.getInfoAsync(tempDirUri);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(tempDirUri, { intermediates: true });
    }

    const outputPath = tempDirUri + `audio_${Date.now()}.wav`;
    const command = `-i ${videoPath} -vn -acodec pcm_s16le -ar 16000 -ac 1 ${outputPath}`;

    const session = await FFmpegKit.executeAsync(command);
    const returnCode = await session.getReturnCode();

    if (!ReturnCode.isSuccess(returnCode)) {
      const logs = await session.getLogs();
      const errorMessage = logs.map((l: any) => String(l.getMessage())).join('\n');
      throw new Error(`[FFmpeg] extractAudio failed: ${errorMessage}`);
    }

    return outputPath;
  }

  // Detect silences using silencedetect filter
  async detectSilences(
    audioPath: string,
    threshold: number,
    minDuration: number
  ): Promise<SilenceSegment[]> {
    console.log('[FFmpeg] Detecting silences:', { threshold, minDuration });
    this.requireFFmpeg();

    const logLines: string[] = [];

    // Collect stderr log lines during this session via log callback
    FFmpegKitConfig.enableLogCallback((log: any) => {
      const message = log.getMessage();
      if (message) {
        logLines.push(String(message));
      }
    });

    const command = `-i ${audioPath} -af "silencedetect=n=${threshold}dB:d=${minDuration}" -f null -`;
    const session = await FFmpegKit.executeAsync(command);
    const returnCode = await session.getReturnCode();

    // Disable log callback after session completes
    FFmpegKitConfig.enableLogCallback(() => {});

    if (!ReturnCode.isSuccess(returnCode)) {
      const stderr = logLines.join('\n');
      throw new Error(`[FFmpeg] detectSilences failed: ${stderr}`);
    }

    const stderr = logLines.join('\n');
    return silenceService.parseSilenceOutput(stderr);
  }

  // Remove silences using concat demuxer
  async removeSilences(
    videoPath: string,
    keepSegments: TimeSegment[],
    _padding: number
  ): Promise<string> {
    console.log('[FFmpeg] Removing silences:', keepSegments.length, 'segments');
    this.requireFFmpeg();

    const tempDirUri = FileSystem.cacheDirectory + 'temp/';
    const dirInfo = await FileSystem.getInfoAsync(tempDirUri);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(tempDirUri, { intermediates: true });
    }

    const timestamp = Date.now();

    // Generate concat list content via silenceService
    const concatContent = silenceService.generateConcatList(videoPath, keepSegments);

    // Write concat list file
    const listFile = tempDirUri + `concat_${timestamp}.txt`;
    await FileSystem.writeAsStringAsync(listFile, concatContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Output path
    const outputPath = tempDirUri + `cut_${timestamp}.mp4`;

    const command = `-f concat -safe 0 -i ${listFile} -c copy ${outputPath}`;
    const session = await FFmpegKit.executeAsync(command);
    const returnCode = await session.getReturnCode();

    if (!ReturnCode.isSuccess(returnCode)) {
      const logs = await session.getLogs();
      const errorMessage = logs.map((l: any) => String(l.getMessage())).join('\n');
      throw new Error(`[FFmpeg] removeSilences failed: ${errorMessage}`);
    }

    return outputPath;
  }

  // Burn-in subtitles (mock — FFmpeg required for real implementation)
  async burnSubtitles(
    _videoPath: string,
    _srtPath: string,
    _style: SubtitleStyle
  ): Promise<string> {
    console.log('[FFmpeg] burnSubtitles — mock implementation');
    this.requireFFmpeg();
    return _videoPath;
  }

  // Generate thumbnail — returns empty string if FFmpeg unavailable (Expo Go)
  async generateThumbnail(videoPath: string, _time: number = 0): Promise<string> {
    console.log('[FFmpeg] Generating thumbnail at time:', _time);

    if (!ffmpegAvailable) {
      console.warn('[FFmpeg] generateThumbnail skipped — native module not available');
      return '';
    }

    const thumbsDirUri = FileSystem.cacheDirectory + 'thumbs/';
    const dirInfo = await FileSystem.getInfoAsync(thumbsDirUri);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(thumbsDirUri, { intermediates: true });
    }

    const outputPath = thumbsDirUri + `thumb_${Date.now()}.jpg`;
    const command = `-i ${videoPath} -ss ${_time} -vframes 1 -q:v 2 ${outputPath}`;

    const session = await FFmpegKit.executeAsync(command);
    const returnCode = await session.getReturnCode();

    if (!ReturnCode.isSuccess(returnCode)) {
      const logs = await session.getLogs();
      const errorMessage = logs.map((l: any) => String(l.getMessage())).join('\n');
      throw new Error(`[FFmpeg] generateThumbnail failed: ${errorMessage}`);
    }

    return outputPath;
  }

  // Resolution map for export
  private getResolutionDimensions(resolution: ExportConfig['resolution']): { width: number; height: number } {
    switch (resolution) {
      case '720p':  return { width: 720,  height: 1280 };
      case '1080p': return { width: 1080, height: 1920 };
      case '4k':    return { width: 2160, height: 3840 };
      default:      return { width: 1080, height: 1920 };
    }
  }

  // Full export pipeline
  async exportVideo(
    config: ExportConfig,
    isPremium: boolean,
    onProgress?: (progress: number, step: string) => void
  ): Promise<string> {
    console.log('[FFmpeg] Exporting video:', config);
    this.requireFFmpeg();

    // --- Free plan duration guard ---
    if (!isPremium) {
      const info = await this.getVideoInfo(config.videoPath);
      const exportDuration = (config.trimEnd ?? info.duration) - (config.trimStart ?? 0);
      if (exportDuration > 60) {
        throw new Error('FREE_PLAN_DURATION_EXCEEDED');
      }
    }

    // Ensure exports directory exists
    const exportsDirUri = FileSystem.documentDirectory + 'exports/';
    const dirInfo = await FileSystem.getInfoAsync(exportsDirUri);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(exportsDirUri, { intermediates: true });
    }

    const outputPath = exportsDirUri + `export_${Date.now()}.mp4`;

    // --- Build video filter chain ---
    const { width, height } = this.getResolutionDimensions(config.resolution);
    const filters: string[] = [];

    // Scale filter
    filters.push(`scale=${width}:${height}`);

    // Watermark filter
    if (config.watermark) {
      filters.push(
        `drawtext=text='BlitzCut':x=w-tw-10:y=h-th-10:fontsize=24:fontcolor=white@0.5`
      );
    }

    // --- Build input args ---
    const inputs: string[] = [];
    const trimFlags = [];
    if (config.trimStart !== undefined && config.trimStart > 0) {
      trimFlags.push(`-ss ${config.trimStart}`);
    }
    if (config.trimEnd !== undefined) {
      trimFlags.push(`-to ${config.trimEnd}`);
    }

    // Add primary video
    inputs.push(`${trimFlags.join(' ')} -i "${config.videoPath}"`);

    // Add background music if provided
    let hasMusic = false;
    if (config.musicPath) {
      inputs.push(`${trimFlags.join(' ')} -i "${config.musicPath}"`);
      hasMusic = true;
    }

    // --- Add Subtitle Filter ---
    if (config.includeSubtitles && config.srtPath) {
      let cleanSrtPath = config.srtPath.replace(/^file:\/\//, '');
      cleanSrtPath = cleanSrtPath.replace(/\\/g, '/').replace(/:/g, '\\\\:'); // Escape windows drive letters
      filters.push(`subtitles='${cleanSrtPath}'`);
    }

    if (config.speed && config.speed !== 1) {
      filters.push(`setpts=${1 / config.speed}*PTS`);
    }

    const vfArg = filters.join(',');

    // --- Build audio filters & FFmpeg command ---
    const origVol = (config.audioVolume ?? 100) / 100;
    const speedAf = config.speed && config.speed !== 1 ? `atempo=${config.speed}` : '';
    let commandParams: string[] = [inputs.join(' ')];

    if (hasMusic) {
      const musicVol = (config.musicVolume ?? 50) / 100;
      const baseAudio = `volume=${origVol}${speedAf ? ',' + speedAf : ''}`;
      const filterComplex = `[0:a]${baseAudio}[a0];[1:a]volume=${musicVol}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout];[0:v]${vfArg}[vout]`;
      
      commandParams.push(`-filter_complex "${filterComplex}"`);
      commandParams.push(`-map "[vout]" -map "[aout]"`);
    } else {
      const baseAudio = `volume=${origVol}${speedAf ? ',' + speedAf : ''}`;
      commandParams.push(`-vf "${vfArg}"`);
      commandParams.push(`-af "${baseAudio}"`);
    }

    commandParams.push(`-c:v libx264 -preset fast -crf 23`);
    commandParams.push(`-c:a aac -b:a 128k`);
    commandParams.push(`-r ${config.fps}`);
    commandParams.push(`-y`);
    commandParams.push(`"${outputPath}"`);

    const command = commandParams.join(' ');

    // --- Progress tracking via statistics callback ---
    let videoDuration = 0;
    try {
      const info = await this.getVideoInfo(config.videoPath);
      videoDuration = config.trimEnd
        ? config.trimEnd - (config.trimStart ?? 0)
        : info.duration - (config.trimStart ?? 0);
    } catch {
      // fallback: progress won't be percentage-accurate
    }

    onProgress?.(0, 'Encoding H.264');

    FFmpegKitConfig.enableStatisticsCallback((statistics: any) => {
      if (videoDuration > 0) {
        const timeMs = statistics.getTime(); // milliseconds processed
        const progress = Math.min(timeMs / (videoDuration * 1000), 1);
        onProgress?.(progress, 'Encoding H.264');
      }
    });

    const session = await FFmpegKit.executeAsync(command);
    const returnCode = await session.getReturnCode();

    // Disable statistics callback after session
    FFmpegKitConfig.enableStatisticsCallback(() => {});

    if (!ReturnCode.isSuccess(returnCode)) {
      const logs = await session.getLogs();
      const errorMessage = logs.map((l: any) => String(l.getMessage())).join('\n');
      throw new Error(`[FFmpeg] exportVideo failed: ${errorMessage}`);
    }

    onProgress?.(1, 'Done');

    return outputPath;
  }

  // Get video info — returns mock data if FFmpeg unavailable (Expo Go)
  async getVideoInfo(_videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
  }> {
    console.log('[FFmpeg] Getting video info:', _videoPath);

    if (!ffmpegAvailable) {
      console.warn('[FFmpeg] getVideoInfo skipped — native module not available');
      return { duration: 60, width: 1080, height: 1920, fps: 30 };
    }

    const session = await FFprobeKit.getMediaInformation(_videoPath);
    const info = session.getMediaInformation();

    if (!info) {
      return { duration: 60, width: 1080, height: 1920, fps: 30 };
    }

    const rawDuration = info.getDuration();
    const duration = typeof rawDuration === 'number'
      ? rawDuration
      : parseFloat(String(rawDuration ?? '0'));

    const streams: any[] = info.getStreams() ?? [];
    const videoStream = streams.find((s: any) => s.getType()?.toLowerCase() === 'video');

    const width: number = videoStream?.getWidth() ?? 0;
    const height: number = videoStream?.getHeight() ?? 0;

    let fps = 30;
    const fpsRaw: string | undefined =
      videoStream?.getProperties()?.['r_frame_rate'] ??
      videoStream?.getProperties()?.['avg_frame_rate'];
    if (fpsRaw && fpsRaw.includes('/')) {
      const [num, den] = fpsRaw.split('/').map(Number);
      if (den && den !== 0) fps = num / den;
    } else if (fpsRaw) {
      fps = parseFloat(fpsRaw);
    }

    return { duration, width, height, fps };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const ffmpegService = FFmpegService.getInstance();
