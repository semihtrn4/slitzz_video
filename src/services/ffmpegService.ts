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

    // 2. Adjustments (Brightness/Contrast) - if needed
    // filterComplex += `${videoStream}eq=brightness=0:contrast=1[adjusted]; `;
    // videoStream = '[adjusted]';

    // 3. Speed (Video)
    if (config.speed && config.speed !== 1) {
      filterComplex += `${videoStream}setpts=${(1/config.speed).toFixed(2)}*PTS[speedv]; `;
      videoStream = '[speedv]';
      filterComplex += `${audioStream}atempo=${config.speed.toFixed(2)}[speeda]; `;
      audioStream = '[speeda]';
    }

    // 4. Subtitles (if SRT exists)
    if (config.srtPath && config.includeSubtitles) {
      const srtPathEscaped = config.srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      filterComplex += `${videoStream}subtitles='${srtPathEscaped}'[subbed]; `;
      videoStream = '[subbed]';
    }

    // 5. Watermark (if free plan)
    if (!isPremium && config.watermark) {
      filterComplex += `${videoStream}drawtext=text='Made with BlitzCut':x=w-tw-20:y=h-th-20:fontsize=24:fontcolor=white@0.5[watermarked]; `;
      videoStream = '[watermarked]';
    }

    // 6. Audio Volume & Background Music
    let finalAudio = '[outa]';
    let audioFilters = '';
    
    // Volume for original audio
    const vol = (config.audioVolume / 100).toFixed(2);
    audioFilters += `${audioStream}volume=${vol}[vol_orig]; `;
    
    if (config.musicPath && config.musicVolume !== undefined) {
      const mVol = (config.musicVolume / 100).toFixed(2);
      // Mix background music (looping not trivial in one command, but amix handles it)
      // Input 1 is the music track
      audioFilters += `[1:a]volume=${mVol}[vol_music]; `;
      audioFilters += `[vol_orig][vol_music]amix=inputs=2:duration=first:dropout_transition=2[outa]`;
    } else {
      audioFilters += `[vol_orig]copy[outa]`;
    }
    
    filterComplex += audioFilters;

    const command = [
      `-i "${config.videoPath}"`,
      config.musicPath ? `-i "${config.musicPath}"` : '',
      `-filter_complex "${filterComplex}"`,
      `-map "${videoStream}"`,
      `-map "[outa]"`,
      `-c:v libx264 -preset fast`,
      config.resolution === '4k' ? '-b:v 10M' : '-b:v 5M',
      `-y "${outputPath}"`
    ].filter(Boolean).join(' ');
    
    // Progress tracking via statistics
    FFmpegKitConfig.enableStatisticsCallback((stats) => {
      // In a real app, we'd compare stats.getTime() with total duration
      onProgress?.(0.5, 'Encoding...');
    });

    const session = await FFmpegKit.execute(command);

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
