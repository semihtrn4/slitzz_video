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
  async extractAudio(videoPath: string, forWhisper: boolean = false): Promise<string> {
    const ext = forWhisper ? 'wav' : 'm4a';
    const audioPath = `${cacheDirectory || ''}extracted_audio_${Date.now()}.${ext}`;
    console.log('[FFmpeg] Extracting audio to:', audioPath);
    
    let command = '';
    if (forWhisper) {
      // 16kHz, mono, 16-bit PCM WAV (Standard for whisper.cpp/whisper.rn)
      command = `-i "${videoPath}" -vn -ar 16000 -ac 1 -c:a pcm_s16le -y "${audioPath}"`;
    } else {
      command = `-i "${videoPath}" -vn -acodec copy -y "${audioPath}"`;
    }

    const session = await FFmpegKit.execute(command);
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
      vStreams += `[v${i}][a${i}]`;
    });

    filter += `${vStreams}concat=n=${keepSegments.length}:v=1:a=1[v][a]`;

    const session = await FFmpegKit.execute(
      `-i "${videoPath}" -filter_complex "${filter}" -map "[v]" -map "[a]" -c:v libx264 -preset superfast -y "${outputPath}"`
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

    // Build filter complex
    let filterComplex = '';
    let videoStream = '[0:v]';
    let audioStream = '[0:a]';
    
    // --- Audio Initial Preparation ---
    // Check if original video has audio to prevent FFmpeg crashes during Trim/Speed/Mix
    const hasAudio = await this.checkHasAudio(config.videoPath);
    console.log(`[FFmpeg] Video has audio: ${hasAudio}`);

    if (!hasAudio) {
      // Create a silent source matching video if no audio exists
      // Using anullsrc as input is complex, so we'll use a filter
      filterComplex += `anullsrc=channel_layout=stereo:sample_rate=44100[silent_init]; `;
      audioStream = '[silent_init]';
    }
    
    // 1. Scale & Aspect Ratio & Resolution
    const is4K = config.resolution.toUpperCase() === '4K';
    let baseWidth = 1080;
    let baseHeight = 1920;

    if (config.aspectRatio) {
      switch (config.aspectRatio) {
        case '1:1': baseWidth = 1080; baseHeight = 1080; break;
        case '4:5': baseWidth = 1080; baseHeight = 1350; break;
        case '16:9': baseWidth = 1920; baseHeight = 1080; break;
        case '9:16': baseWidth = 1080; baseHeight = 1920; break;
      }
    }

    const width = is4K ? baseWidth * 2 : baseWidth;
    const height = is4K ? baseHeight * 2 : baseHeight;

    filterComplex += `${videoStream}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[scaled]; `;
    videoStream = '[scaled]';

    // 2. Trim (Video & Audio)
    if (config.trimStart !== undefined || config.trimEnd !== undefined) {
      const start = config.trimStart || 0;
      const end = config.trimEnd || 999999; // effectively no end if not specified
      filterComplex += `${videoStream}trim=start=${start.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS[trimmedv]; `;
      videoStream = '[trimmedv]';
      filterComplex += `${audioStream}atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS[trimmeda]; `;
      audioStream = '[trimmeda]';
    }

    // 3. Adjustments (Brightness/Contrast) - if needed
    // filterComplex += `${videoStream}eq=brightness=0:contrast=1[adjusted]; `;
    // videoStream = '[adjusted]';

    // 3. Speed (Video & Audio)
    if (config.speed && config.speed !== 1) {
      filterComplex += `${videoStream}setpts=${(1/config.speed).toFixed(4)}*PTS[speedv]; `;
      videoStream = '[speedv]';
      
      // atempo has a limit of 0.5 - 2.0. Need to chain if outside this range.
      let s = config.speed;
      let atempoFilter = '';
      while (s > 2.0) {
        atempoFilter += 'atempo=2.0,';
        s /= 2.0;
      }
      while (s < 0.5) {
        atempoFilter += 'atempo=0.5,';
        s /= 0.5;
      }
      atempoFilter += `atempo=${s.toFixed(3)}`;
      
      filterComplex += `${audioStream}${atempoFilter}[speeda]; `;
      audioStream = '[speeda]';
    }

    // 4. Subtitles (if SRT/ASS exists)
    if (config.srtPath && config.includeSubtitles) {
      const srtPathEscaped = config.srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      // ffmpeg subtitles filter uses 'subtitles' for both .srt and .ass
      filterComplex += `${videoStream}subtitles='${srtPathEscaped}'[subbed]; `;
      videoStream = '[subbed]';
    }
    
    // 5. Watermark (if free plan)
    if (!isPremium && config.watermark) {
      filterComplex += `${videoStream}drawtext=text='Made with BlitzCut':x=w-tw-20:y=h-th-20:fontsize=24:fontcolor=white@0.5[watermarked]; `;
      videoStream = '[watermarked]';
    }

    // --- Audio Mixing & Final Volume ---
    // At this point, audioStream has already been processed by Trim/Speed filters if they were active
    const finalVol = (config.audioVolume / 100).toFixed(2);
    filterComplex += `${audioStream}volume=${finalVol}[vol_orig]; `;
    
    if (config.musicPath && config.musicVolume !== undefined) {
      const mVol = (config.musicVolume / 100).toFixed(2);
      // Mix background music (Input index 1)
      filterComplex += `[1:a]volume=${mVol}[vol_music]; `;
      filterComplex += `[vol_orig][vol_music]amix=inputs=2:duration=first:dropout_transition=2[outa]`;
    } else {
      filterComplex += `[vol_orig]anull[outa]`;
    }

    // --- FFmpeg Command with Arguments (Safer than string) ---
    const args = [
      '-i', config.videoPath,
    ];

    if (config.musicPath) {
      args.push('-stream_loop', '-1', '-i', config.musicPath);
    }

    args.push(
      '-filter_complex', filterComplex,
      '-map', videoStream,
      '-map', '[outa]',
      '-c:v', 'libx264',
      '-preset', 'fast'
    );

    if (config.resolution === '4k') {
      args.push('-b:v', '10M');
    } else {
      args.push('-b:v', '5M');
    }

    args.push('-shortest', '-y', outputPath);
    
    console.log('[FFmpeg] Exporting with arguments:', JSON.stringify(args));

    // Progress tracking
    FFmpegKitConfig.enableStatisticsCallback((stats) => {
      onProgress?.(0.5, 'Encoding...');
    });

    const session = await FFmpegKit.executeWithArguments(args);
    const returnCode = await session.getReturnCode();

    if (ReturnCode.isSuccess(returnCode)) {
      onProgress?.(1, 'Complete');
      return outputPath;
    } else {
      const logs = await session.getLogs();
      const failMessage = logs.length > 0 ? logs[logs.length - 1].getMessage() : 'Unknown FFmpeg error';
      console.error('[FFmpeg] Export failed:', failMessage);
      throw new Error(`FFmpeg export failed: ${failMessage}`);
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

  /**
   * Checks if a video file has an audio stream
   */
  async checkHasAudio(videoPath: string): Promise<boolean> {
    try {
      const session = await FFmpegKit.execute(`-i "${videoPath}" -hide_banner`);
      const output = await session.getOutput();
      return output.includes('Audio:');
    } catch {
      return false;
    }
  }
}

export const ffmpegService = FFmpegService.getInstance();
