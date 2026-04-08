// @ts-ignore - ffmpeg-kit-react-native is aliased to kroog-ffmpeg-kit-react-native and its d.ts is not structured as a module
import { FFmpegKit, ReturnCode, FFmpegKitConfig, Log, Statistics } from 'ffmpeg-kit-react-native';
import { Directory, Paths } from 'expo-file-system';
import { silenceService } from './silenceService';
import { getPath, ensureAbsolute, stripFileProtocol } from '../utils/pathUtils';
import type { SilenceSegment, TimeSegment, ExportConfig } from '../types';

export class FFmpegService {
  private static instance: FFmpegService;
  private logEnabled: boolean = false;

  static getInstance(): FFmpegService {
    if (!FFmpegService.instance) {
      FFmpegService.instance = new FFmpegService();
    }
    return FFmpegService.instance;
  }

  private async ensureLogCallback() {
    if (!this.logEnabled) {
      this.logEnabled = true;
      try {
        FFmpegKitConfig.enableLogCallback((log: Log) => {
          console.log(`[FFmpeg Log] ${log.getMessage()}`);
        });
      } catch (e) {
        console.warn('Failed to enable FFmpeg logging', e);
      }
    }
  }

  async extractAudio(videoPath: string, forWhisper: boolean = false): Promise<string> {
    await this.ensureLogCallback();
    const ext = forWhisper ? 'wav' : 'm4a';
    const audioPath = getPath(Paths.cache, `extracted_audio_${Date.now()}.${ext}`);
    console.log('[FFmpeg] Extracting audio to:', audioPath);

    const absVideoPath = stripFileProtocol(ensureAbsolute(videoPath));

    const rawAudioPath = stripFileProtocol(audioPath);
    let command = '';
    if (forWhisper) {
      command = `-i "${absVideoPath}" -vn -ar 16000 -ac 1 -c:a pcm_s16le -y "${rawAudioPath}"`;
    } else {
      command = `-i "${absVideoPath}" -vn -acodec copy -y "${rawAudioPath}"`;
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

  async generateThumbnail(videoPath: string, timeSeconds: number): Promise<string> {
    await this.ensureLogCallback();
    const thumbnailPath = getPath(Paths.cache, `thumb_${Date.now()}.jpg`);
    const rawThumbnailPath = stripFileProtocol(thumbnailPath);
    console.log('[FFmpeg] Generating thumbnail at:', rawThumbnailPath);

    const absVideoPath = stripFileProtocol(ensureAbsolute(videoPath));

    const session = await FFmpegKit.execute(
      `-ss ${timeSeconds} -i "${absVideoPath}" -vframes 1 -q:v 2 -y "${rawThumbnailPath}"`
    );
    const returnCode = await session.getReturnCode();

    if (ReturnCode.isSuccess(returnCode)) {
      return thumbnailPath;
    } else {
      throw new Error('FFmpeg thumbnail generation failed');
    }
  }

  async detectSilences(
    audioPath: string,
    threshold: number = -30,
    minDuration: number = 0.5
  ): Promise<SilenceSegment[]> {
    await this.ensureLogCallback();
    console.log('[FFmpeg] Detecting silences...');

    const rawAudioPath = stripFileProtocol(audioPath);
    const session = await FFmpegKit.execute(
      `-i "${rawAudioPath}" -af silencedetect=n=${threshold}dB:d=${minDuration} -f null -`
    );

    // FIX #1    // silencedetect -f null - komutu genellikle non-zero döner, output'a bakarak karar ver
    const logs = await session.getLogs();
    const allOutput = logs.map((l: Log) => l.getMessage()).join('\n');
    const returnCode = await session.getReturnCode();

    if (ReturnCode.isSuccess(returnCode) || allOutput.includes('silencedetect')) {
      return silenceService.parseSilenceOutput(allOutput);
    } else {
      throw new Error('FFmpeg silence detection failed');
    }
  }

  async removeSilences(
    videoPath: string,
    keepSegments: TimeSegment[],
    padding: number = 100
  ): Promise<string> {
    await this.ensureLogCallback();
    if (keepSegments.length === 0) return videoPath;

    const outputPath = getPath(Paths.cache, `cut_${Date.now()}.mp4`);
    const rawOutputPath = stripFileProtocol(outputPath);
    console.log('[FFmpeg] Removing silences, generating:', rawOutputPath);

    // FIX #2: Ses akışı olup olmadığını kontrol et
    const absVideoPath = stripFileProtocol(ensureAbsolute(videoPath));
    const hasAudio = await this.checkHasAudio(absVideoPath);

    let filter = '';
    let vStreams = '';

    if (hasAudio) {
      // Video + Audio concat
      keepSegments.forEach((seg, i) => {
        filter += `[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]; `;
        filter += `[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]; `;
        vStreams += `[v${i}][a${i}]`;
      });
      filter += `${vStreams}concat=n=${keepSegments.length}:v=1:a=1[v][a]`;

      const session = await FFmpegKit.execute(
        `-i "${absVideoPath}" -filter_complex "${filter}" -map "[v]" -map "[a]" -c:v libx264 -preset superfast -y "${rawOutputPath}"`
      );
      if (ReturnCode.isSuccess(await session.getReturnCode())) {
        return outputPath;
      } else {
        throw new Error('FFmpeg silence removal failed');
      }
    } else {
      // Sadece video (ses yok)
      keepSegments.forEach((seg, i) => {
        filter += `[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]; `;
        vStreams += `[v${i}]`;
      });
      filter += `${vStreams}concat=n=${keepSegments.length}:v=1:a=0[v]`;

      const session = await FFmpegKit.execute(
        `-i "${absVideoPath}" -filter_complex "${filter}" -map "[v]" -c:v libx264 -preset superfast -an -y "${rawOutputPath}"`
      );
      if (ReturnCode.isSuccess(await session.getReturnCode())) {
        return outputPath;
      } else {
        throw new Error('FFmpeg silence removal (no audio) failed');
      }
    }
  }

  async exportVideo(
    config: ExportConfig,
    isPremium: boolean,
    onProgress?: (progress: number, step: string) => void
  ): Promise<string> {
    await this.ensureLogCallback();
    const exportsDir = getPath(Paths.document, 'exports/');
    const dir = new Directory(exportsDir);
    if (!dir.exists) {
      dir.create();
    }

    const outputPath = getPath(exportsDir, `BlitzCut_${Date.now()}.mp4`);
    const rawOutputPath = stripFileProtocol(outputPath);
    onProgress?.(0.1, 'Preparing export...');

    let filterComplex = '';
    let videoStream = '[0:v]';
    let audioStream = '[0:a]';
    
    // Video süresini tahmin et (fade out ve progress için)
    const rawDuration = config.trimEnd 
      ? (config.trimEnd - (config.trimStart || 0)) 
      : 999; // Fallback
    const estimatedDuration = rawDuration / (config.speed || 1);

    // FIX #1: checkHasAudio artık getLogs() kullanıyor (aşağıda)
    const rawInputPath = stripFileProtocol(ensureAbsolute(config.videoPath));
    const hasAudio = await this.checkHasAudio(config.videoPath);
    console.log(`[FFmpeg] Video has audio: ${hasAudio}, Input: ${rawInputPath}`);

    if (!hasAudio) {
      filterComplex += `anullsrc=channel_layout=stereo:sample_rate=44100[a0]; `;
      audioStream = '[a0]';
    } else {
      filterComplex += `[0:a]anull[a0]; `;
      audioStream = '[a0]';
    }

    // FIX #3: resolution karşılaştırması tutarlı hale getirildi (hep lowercase)
    const is4K = config.resolution === '4k';
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

    filterComplex += `${videoStream}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v1]; `;
    videoStream = '[v1]';

    if (config.trimStart !== undefined || config.trimEnd !== undefined) {
      const start = config.trimStart || 0;
      const end = config.trimEnd || 999999;
      filterComplex += `${videoStream}trim=start=${start.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS[v2]; `;
      videoStream = '[v2]';
      filterComplex += `${audioStream}atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS[a1]; `;
      audioStream = '[a1]';
    }

    if (config.speed && config.speed !== 1) {
      filterComplex += `${videoStream}setpts=${(1 / config.speed).toFixed(4)}*PTS[v3]; `;
      videoStream = '[v3]';

      let s = config.speed;
      let atempoFilter = '';
      while (s > 2.0) { atempoFilter += 'atempo=2.0,'; s /= 2.0; }
      while (s < 0.5) { atempoFilter += 'atempo=0.5,'; s *= 2.0; }
      atempoFilter += `atempo=${s.toFixed(3)}`;

      filterComplex += `${audioStream}${atempoFilter}[a2]; `;
      audioStream = '[a2]';
    }

    if (config.srtPath && config.includeSubtitles) {
      // FFmpeg subtitles filtresi file:// protokolünü sevmez, ham yol bekler
      const rawSrtPath = stripFileProtocol(config.srtPath);
      const srtPathEscaped = rawSrtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      filterComplex += `${videoStream}subtitles='${srtPathEscaped}'[v4]; `;
      videoStream = '[v4]';
    }

    if (!isPremium && config.watermark) {
      filterComplex += `${videoStream}drawtext=text='Made with BlitzCut':x=w-tw-20:y=h-th-20:fontsize=24:fontcolor=white@0.5[v5]; `;
      videoStream = '[v5]';
    }

    const finalVol = (config.audioVolume / 100).toFixed(2);
    let audioFilter = `volume=${finalVol}`;

    // Apply Fade In/Out
    if (config.fadeIn) {
      audioFilter += `,afade=t=in:st=0:d=1`;
    }
    if (config.fadeOut && estimatedDuration > 1) {
      const fadeOutStart = Math.max(0, estimatedDuration - 1);
      audioFilter += `,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=1`;
    }

    filterComplex += `${audioStream}${audioFilter}[v_orig]; `;

    if (config.musicPath && config.musicVolume !== undefined) {
      const mVol = (config.musicVolume / 100).toFixed(2);
      let musicFilter = `volume=${mVol}`;
      
      if (config.fadeIn) {
        musicFilter += `,afade=t=in:st=0:d=1`;
      }
      if (config.fadeOut && estimatedDuration > 1) {
        const fadeOutStart = Math.max(0, estimatedDuration - 1);
        musicFilter += `,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=1`;
      }

      filterComplex += `[1:a]${musicFilter}[v_music]; `;
      filterComplex += `[v_orig][v_music]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[outa]`;
    } else {
      filterComplex += `[v_orig]anull[outa]`;
    }

    const args = ['-i', rawInputPath];

    if (config.musicPath) {
      const absMusicPath = stripFileProtocol(ensureAbsolute(config.musicPath));
      args.push('-stream_loop', '-1', '-i', absMusicPath);
    }

    args.push(
      '-filter_complex', filterComplex,
      '-map', videoStream,
      '-map', '[outa]',
      '-c:v', 'libx264',
      '-preset', 'fast'
    );

    // FIX #3: bitrate kontrolü is4K ile tutarlı
    args.push('-b:v', is4K ? '10M' : '5M');
    args.push('-shortest', '-y', rawOutputPath);

    console.log('[FFmpeg] Exporting with arguments:', JSON.stringify(args));

    // Progress takibi için statistics callback'i kullan
    FFmpegKitConfig.enableStatisticsCallback((stats: Statistics) => {
      const timeMs = stats.getTime(); // işlenen süre ms
      if (timeMs > 0 && estimatedDuration > 0) {
        const progress = Math.min(0.9, (timeMs / 1000) / estimatedDuration);
        onProgress?.(0.1 + progress * 0.8, 'Encoding...');
      }
    });

    const session = await FFmpegKit.executeWithArguments(args);
    const returnCode = await session.getReturnCode();

    // Callback'i temizle
    FFmpegKitConfig.enableStatisticsCallback(null as any);

    if (ReturnCode.isSuccess(returnCode)) {
      onProgress?.(1, 'Complete');
      return outputPath;
    } else {
      const logs = await session.getLogs();
      // En son log her zaman açıklayıcı olmayabilir, tümünü join edip hatayı arayalım
      const allLogs = logs.map((l: Log) => l.getMessage()).join('\n');
      const failMessage = logs.length > 0 ? logs[logs.length - 1].getMessage() : 'No log output available';
      console.error('[FFmpeg] Export failed. Total output:', allLogs);
      throw new Error(`FFmpeg export failed: ${failMessage}`);
    }
  }

  async getVideoInfo(videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
  }> {
    await this.ensureLogCallback();
    const absVideoPath = stripFileProtocol(ensureAbsolute(videoPath));
    const session = await FFmpegKit.execute(`-i "${absVideoPath}" -hide_banner`);
    // FIX #1: getVideoInfo de getLogs() kullanmalı
    const logs = await session.getLogs();
    const output = logs.map((l: Log) => l.getMessage()).join('\n');

    const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    let duration = 0;
    if (durationMatch) {
      duration =
        parseInt(durationMatch[1]) * 3600 +
        parseInt(durationMatch[2]) * 60 +
        parseInt(durationMatch[3]) +
        parseInt(durationMatch[4]) / 100;
    }

    // Parse resolution
    const resMatch = output.match(/(\d{2,4})x(\d{2,4})/);
    const w = resMatch ? parseInt(resMatch[1]) : 1080;
    const h = resMatch ? parseInt(resMatch[2]) : 1920;

    // Parse fps
    const fpsMatch = output.match(/(\d+(?:\.\d+)?) fps/);
    const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 30;

    return { duration, width: w, height: h, fps };
  }

  // FIX #1: getLogs() ile stderr'i oku, getOutput() değil
  async checkHasAudio(videoPath: string): Promise<boolean> {
    await this.ensureLogCallback();
    try {
      const absVideoPath = stripFileProtocol(ensureAbsolute(videoPath));
      const session = await FFmpegKit.execute(`-i "${absVideoPath}" -hide_banner`);
      const logs = await session.getLogs();
      const output = logs.map((l: Log) => l.getMessage()).join('\n');
      return output.includes('Audio:');
    } catch {
      return false;
    }
  }
}

export const ffmpegService = FFmpegService.getInstance();
