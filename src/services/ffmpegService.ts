import { FFmpegKit, ReturnCode, FFmpegKitConfig } from 'ffmpeg-kit-react-native';
import * as FileSystem from 'expo-file-system/legacy';
const documentDirectory = (FileSystem as any).documentDirectory;
const cacheDirectory = (FileSystem as any).cacheDirectory;
import { silenceService } from './silenceService';
import type { SilenceSegment, TimeSegment, SubtitleStyle, ExportConfig } from '../types';

export class FFmpegService {
  private static instance: FFmpegService;

  static getInstance(): FFmpegService {
    if (!FFmpegService.instance) {
      FFmpegService.instance = new FFmpegService();
      // Setup logging for debugging
      FFmpegKitConfig.enableLogCallback((log) => {
        console.log(`[FFmpeg Log] ${log.getMessage()}`);
      });
    }
    return FFmpegService.instance;
  }

  /**
   * Extracts audio stream from video for processing (Whisper/Silence Detection)
   */
  async extractAudio(videoPath: string): Promise<string> {
    const audioPath = `${cacheDirectory || ''}extracted_audio_${Date.now()}.m4a`;
    console.log('[FFmpeg] Extracting audio to:', audioPath);

    // -vn: no video, -acodec copy: copy audio stream without re-encoding
    const session = await FFmpegKit.execute(`-i "${videoPath}" -vn -acodec copy -y "${audioPath}"`);
    const returnCode = await session.getReturnCode();

    if (ReturnCode.isSuccess(returnCode)) {
      return audioPath;
    } else {
      const logs = await session.getLogs();
      throw new Error(`FFmpeg audio extraction failed: ${logs[logs.length - 1]?.getMessage()}`);
    }
  }

  /**
   * Generates a thumbnail for a video at a specific time
   */
  async generateThumbnail(videoPath: string, timeSeconds: number): Promise<string> {
    const thumbnailPath = `${cacheDirectory || ''}thumb_${Date.now()}.jpg`;
    console.log('[FFmpeg] Generating thumbnail at:', thumbnailPath);

    // -ss: seek to time, -i: input, -vframes 1: extract 1 frame
    const session = await FFmpegKit.execute(
      `-ss ${timeSeconds} -i "${videoPath}" -vframes 1 -q:v 2 -y "${thumbnailPath}"`
    );
    const returnCode = await session.getReturnCode();

    if (ReturnCode.isSuccess(returnCode)) {
      return thumbnailPath;
    } else {
      throw new Error('FFmpeg thumbnail generation failed');
    }
  }

  /**
   * Detects silences in an audio file using FFmpeg silencedetect filter
   */
  async detectSilences(
    audioPath: string,
    threshold: number = -30,
    minDuration: number = 0.5
  ): Promise<SilenceSegment[]> {
    console.log('[FFmpeg] Detecting silences...');
    
    // -af silencedetect: audio filter for silence detection
    // -f null -: output to null (we only need the stderr logs)
    const session = await FFmpegKit.execute(
      `-i "${audioPath}" -af silencedetect=n=${threshold}dB:d=${minDuration} -f null -`
    );
    
    const output = await session.getOutput();
    const returnCode = await session.getReturnCode();

    if (ReturnCode.isSuccess(returnCode)) {
      return silenceService.parseSilenceOutput(output);
    } else {
      throw new Error('FFmpeg silence detection failed');
    }
  }

  /**
   * Removes silent segments from video by creating a concat filter
   */
  async removeSilences(
    videoPath: string,
    keepSegments: TimeSegment[],
    padding: number = 100
  ): Promise<string> {
    if (keepSegments.length === 0) return videoPath;

    const outputPath = `${cacheDirectory || ''}cut_${Date.now()}.mp4`;
    console.log('[FFmpeg] Removing silences, generating:', outputPath);

    // Building complex filter for trimming and concatenation
    // Example: [0:v]trim=0:5,setpts=PTS-STARTPTS[v0]; [0:a]atrim=0:5,asetpts=PTS-STARTPTS[a0]; ... [v0][a0][v1][a1]concat=n=2:v=1:a=1[out]
    let filter = '';
    let vStreams = '';
    let aStreams = '';

    keepSegments.forEach((seg, i) => {
      filter += `[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]; `;
      filter += `[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]; `;
      vStreams += `[v${i}]`;
      aStreams += `[a${i}]`;
    });

    filter += `${vStreams}${aStreams}concat=n=${keepSegments.length}:v=1:a=1[v][a]`;

    const session = await FFmpegKit.execute(
      `-i "${videoPath}" -filter_complex "${filter}" -map "[v]" -map "[a]" -preset superfast -y "${outputPath}"`
    );

    if (ReturnCode.isSuccess(await session.getReturnCode())) {
      return outputPath;
    } else {
      throw new Error('FFmpeg silence removal failed');
    }
  }

  /**
   * Final export with all settings (Subtitles, Watermark, Speed, etc.)
   */
  async exportVideo(
    config: ExportConfig,
    isPremium: boolean,
    onProgress?: (progress: number, step: string) => void
  ): Promise<string> {
    const exportsDir = `${documentDirectory || ''}exports/`;
    const dirInfo = await FileSystem.getInfoAsync(exportsDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(exportsDir, { intermediates: true });
    }

    const outputPath = `${exportsDir}BlitzCut_${Date.now()}.mp4`;
    onProgress?.(0.1, 'Preparing export...');

    // Build command parts
    let filters = [];
    
    // 1. Scale & Aspect Ratio
    const is4K = config.resolution.toUpperCase() === '4K';
    const [width, height] = is4K ? [2160, 3840] : [1080, 1920];
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`);

    // 2. Subtitles (if SRT exists)
    if (config.srtPath && config.includeSubtitles) {
      // ffmpeg expects absolute path with escaped colons for subtitles filter on some platforms
      const srtPathEscaped = config.srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      filters.push(`subtitles='${srtPathEscaped}'`);
    }

    // 3. Watermark (if free plan)
    if (!isPremium && config.watermark) {
      // Draw text watermark for mock/simpler implementation
      filters.push(`drawtext=text='Made with BlitzCut':x=w-tw-20:y=h-th-20:fontsize=24:fontcolor=white@0.5`);
    }

    const filterString = filters.join(',');
    
    // Progress tracking via statistics
    FFmpegKitConfig.enableStatisticsCallback((stats) => {
      // In a real app, we'd compare stats.getTime() with total duration
      onProgress?.(0.5, 'Encoding...');
    });

    const session = await FFmpegKit.execute(
      `-i "${config.videoPath}" -vf "${filterString}" -c:v libx264 -preset fast -y "${outputPath}"`
    );

    if (ReturnCode.isSuccess(await session.getReturnCode())) {
      onProgress?.(1, 'Complete');
      return outputPath;
    } else {
      throw new Error('FFmpeg export failed');
    }
  }

  async getVideoInfo(videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
  }> {
    const session = await FFmpegKit.execute(`-i "${videoPath}" -hide_banner`);
    const output = await session.getOutput();
    
    // Parse duration from: Duration: 00:00:05.10, start: 0.000000, bitrate: 201 kb/s
    const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}).(\d{2})/);
    let duration = 0;
    if (durationMatch) {
      duration = parseInt(durationMatch[1]) * 3600 +
                 parseInt(durationMatch[2]) * 60 +
                 parseInt(durationMatch[3]) +
                 parseInt(durationMatch[4]) / 100;
    }

    return { duration, width: 1080, height: 1920, fps: 30 };
  }
}

export const ffmpegService = FFmpegService.getInstance();
