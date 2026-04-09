// @ts-ignore
import { FFmpegKit, ReturnCode, FFmpegKitConfig, Log, Statistics } from 'ffmpeg-kit-react-native';
import { Directory, Paths } from 'expo-file-system';
import { silenceService } from './silenceService';
import { getPath, ensureAbsolute, stripFileProtocol } from '../utils/pathUtils';
import type { SilenceSegment, TimeSegment, ExportConfig } from '../types';

export class FFmpegService {
  private static instance: FFmpegService;
  private logEnabled: boolean = false;
  private _nativeAvailable: boolean | null = null;

  // FIX: Global log buffer — native crash olduğunda son 50 satırı sakla
  static lastGlobalLogs: string[] = [];
  private static readonly MAX_GLOBAL_LOGS = 50;

  static getInstance(): FFmpegService {
    if (!FFmpegService.instance) {
      FFmpegService.instance = new FFmpegService();
    }
    return FFmpegService.instance;
  }

  // Native modülün hazır olup olmadığını kontrol et
  private async isNativeAvailable(): Promise<boolean> {
    if (this._nativeAvailable !== null) return this._nativeAvailable;
    try {
      const session = await FFmpegKit.execute('-version');
      this._nativeAvailable = session != null;
    } catch {
      this._nativeAvailable = false;
    }
    return this._nativeAvailable;
  }

  private async getSessionOutput(session: any): Promise<string> {
    const logs = await session.getLogs();
    const failStack = await session.getFailStackTrace();
    const allLogs = logs.map((l: any) => l.getMessage()).join('\n');

    // FIX: Log boşsa global buffer'dan son satırları çek
    if (!allLogs && !failStack) {
      const globalBuf = FFmpegService.lastGlobalLogs.slice(-20).join('\n');
      if (globalBuf) {
        return `No session log (Native Crash). Last global logs:\n${globalBuf}`;
      }
      return 'No log output available (Native Crash or Missing Stream)';
    }

    return `LOGS:\n${allLogs}\n\nSTACK TRACE:\n${failStack || 'None'}`;
  }

  private throwIfNativeUnavailable() {
    if (this._nativeAvailable === false) {
      throw new Error(
        'FFmpeg native modülü bulunamadı. Bu özellik Expo Go\'da çalışmaz.\n' +
        'Native build için: npx expo run:ios veya npx expo run:android'
      );
    }
  }

  private async ensureLogCallback() {
    if (!this.logEnabled) {
      this.logEnabled = true;
      try {
        FFmpegKitConfig.enableLogCallback((log: Log) => {
          const msg = log.getMessage();
          console.log(`[FFmpeg Log] ${msg}`);

          // FIX: Global buffer'a ekle, 50 satırı geçince en eskiyi sil
          FFmpegService.lastGlobalLogs.push(msg);
          if (FFmpegService.lastGlobalLogs.length > FFmpegService.MAX_GLOBAL_LOGS) {
            FFmpegService.lastGlobalLogs.shift();
          }
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
    const absVideoPath = stripFileProtocol(ensureAbsolute(videoPath));

    try {
      const { File } = require('expo-file-system');
      const videoFile = new File(videoPath);
      if (!videoFile.exists) {
        throw new Error(`Input file NOT FOUND: ${videoPath}`);
      }
    } catch (e) {
      console.warn('[FFmpeg] Pre-check failed (checking URI):', videoPath);
    }

    const rawAudioPath = stripFileProtocol(audioPath);

    let args: string[] = [];
    if (forWhisper) {
      args = ['-i', absVideoPath, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', rawAudioPath];
    } else {
      args = ['-i', absVideoPath, '-vn', '-c:a', 'aac', '-q:a', '2', '-y', rawAudioPath];
    }

    const session = await FFmpegKit.executeWithArguments(args);
    const returnCode = await session.getReturnCode();

    if (ReturnCode.isSuccess(returnCode)) {
      return forWhisper ? rawAudioPath : audioPath;
    } else {
      const output = await this.getSessionOutput(session);
      console.error('[FFmpeg] Audio extraction failed:', output);
      throw new Error(`FFmpeg audio extraction failed.\nTarget: ${rawAudioPath}\nSource: ${absVideoPath}\nErrors: ${output}`);
    }
  }

  async generateThumbnail(videoPath: string, timeSeconds: number): Promise<string> {
    await this.ensureLogCallback();
    const thumbnailPath = getPath(Paths.cache, `thumb_${Date.now()}.jpg`);
    const rawThumbnailPath = stripFileProtocol(thumbnailPath);
    const absVideoPath = stripFileProtocol(ensureAbsolute(videoPath));

    const session = await FFmpegKit.execute(
      `-ss ${timeSeconds} -i "${absVideoPath}" -vframes 1 -q:v 2 -y "${rawThumbnailPath}"`
    );
    const returnCode = await session.getReturnCode();

    if (ReturnCode.isSuccess(returnCode)) {
      return thumbnailPath;
    } else {
      const output = await this.getSessionOutput(session);
      console.error('[FFmpeg] Thumbnail generation failed:', output);
      throw new Error(`FFmpeg thumbnail generation failed: ${output}`);
    }
  }

  async detectSilences(
    audioPath: string,
    threshold: number = -30,
    minDuration: number = 0.5
  ): Promise<SilenceSegment[]> {
    await this.ensureLogCallback();
    const rawAudioPath = stripFileProtocol(audioPath);
    const session = await FFmpegKit.execute(
      `-i "${rawAudioPath}" -af silencedetect=n=${threshold}dB:d=${minDuration} -f null -`
    );

    const logs = await session.getLogs();
    const allOutput = logs.map((l: Log) => l.getMessage()).join('\n');
    const returnCode = await session.getReturnCode();

    if (ReturnCode.isSuccess(returnCode) || allOutput.includes('silencedetect')) {
      return silenceService.parseSilenceOutput(allOutput);
    } else {
      const output = await this.getSessionOutput(session);
      console.error('[FFmpeg] Silence detection failed:', output);
      throw new Error(`FFmpeg silence detection failed: ${output}`);
    }
  }

  async removeSilences(
    videoPath: string,
    keepSegments: TimeSegment[]
  ): Promise<string> {
    await this.ensureLogCallback();
    if (keepSegments.length === 0) return videoPath;

    const outputPath = getPath(Paths.cache, `cut_${Date.now()}.mp4`);
    const rawOutputPath = stripFileProtocol(outputPath);
    const absVideoPath = stripFileProtocol(ensureAbsolute(videoPath));
    const info = await this.getVideoInfo(absVideoPath);
    const hasAudio = info.hasAudio;
    const hasVideo = info.hasVideo;

    let filter = '';
    let streams = '';

    if (hasVideo && hasAudio) {
      keepSegments.forEach((seg, i) => {
        filter += `[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}];`;
        filter += `[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}];`;
        streams += `[v${i}][a${i}]`;
      });
      filter += `${streams}concat=n=${keepSegments.length}:v=1:a=1[vout][aout]`;

      const session = await FFmpegKit.execute(
        `-i "${absVideoPath}" -filter_complex "${filter}" -map "[vout]" -map "[aout]" -c:v libx264 -preset superfast -c:a aac -y "${rawOutputPath}"`
      );
      if (ReturnCode.isSuccess(await session.getReturnCode())) return outputPath;
      const logs = await session.getLogs();
      throw new Error(`FFmpeg silence removal failed (Audio+Video): ${logs[logs.length - 1]?.getMessage()}`);

    } else if (hasVideo && !hasAudio) {
      keepSegments.forEach((seg, i) => {
        filter += `[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}];`;
        streams += `[v${i}]`;
      });
      filter += `${streams}concat=n=${keepSegments.length}:v=1:a=0[vout]`;

      const session = await FFmpegKit.execute(
        `-i "${absVideoPath}" -filter_complex "${filter}" -map "[vout]" -c:v libx264 -preset superfast -an -y "${rawOutputPath}"`
      );
      if (ReturnCode.isSuccess(await session.getReturnCode())) return outputPath;
      const logs = await session.getLogs();
      throw new Error(`FFmpeg silence removal failed (Video Only): ${logs[logs.length - 1]?.getMessage()}`);

    } else if (!hasVideo && hasAudio) {
      keepSegments.forEach((seg, i) => {
        filter += `[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}];`;
        streams += `[a${i}]`;
      });
      filter += `${streams}concat=n=${keepSegments.length}:v=0:a=1[aout]`;

      const session = await FFmpegKit.execute(
        `-i "${absVideoPath}" -filter_complex "${filter}" -map "[aout]" -c:a aac -y "${rawOutputPath}"`
      );
      if (ReturnCode.isSuccess(await session.getReturnCode())) return outputPath;
      const output = await this.getSessionOutput(session);
      console.error('[FFmpeg] Silence removal failed (Audio Only):', output);
      throw new Error(`FFmpeg silence removal failed (Audio Only): ${output}`);

    } else {
      throw new Error('File has neither audio nor video streams');
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
      dir.create({ intermediates: true });
    }

    const outputPath = getPath(exportsDir, `SlitzCut_${Date.now()}.mp4`);
    const rawOutputPath = stripFileProtocol(outputPath);
    onProgress?.(0.1, 'Preparing export...');

    const rawInputPath = stripFileProtocol(ensureAbsolute(config.videoPath));
    const info = await this.getVideoInfo(rawInputPath);
    const hasAudio = info.hasAudio;
    const hasVideo = info.hasVideo;

    console.log(`[FFmpeg] hasAudio: ${hasAudio}, hasVideo: ${hasVideo}, duration: ${info.duration}`);

    const preciseDuration = config.trimEnd
      ? config.trimEnd - (config.trimStart || 0)
      : (info.duration > 0 ? info.duration : 60);
    const estimatedDuration = preciseDuration / (config.speed || 1);

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

    const args: string[] = [];

    if (!hasAudio) {
      const nullDur = preciseDuration / (config.speed || 1);
      const safeNullDur = Math.max(nullDur, 1).toFixed(3);
      args.push('-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=44100:d=${safeNullDur}`);
    }

    args.push('-i', rawInputPath);

    const videoInputIdx = hasAudio ? 0 : 1;
    const audioInputIdx = 0;

    let musicInputIdx = -1;
    if (config.musicPath) {
      const absMusicPath = stripFileProtocol(ensureAbsolute(config.musicPath));
      args.push('-stream_loop', '-1', '-i', absMusicPath);
      musicInputIdx = hasAudio ? 1 : 2;
    }

    const fc: string[] = [];
    let videoStream = '';
    let audioStream = '';

    if (!hasVideo) {
      fc.push(`color=c=black:s=${width}x${height}:r=30:d=${preciseDuration.toFixed(3)}[v0]`);
      videoStream = '[v0]';
    } else {
      fc.push(`[${videoInputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v0]`);
      videoStream = '[v0]';
    }

    if (hasAudio) {
      fc.push(`[${videoInputIdx}:a]asetpts=PTS-STARTPTS[a0]`);
    } else {
      fc.push(`[0:a]aresample=44100[a0]`);
    }
    audioStream = '[a0]';

    if (config.trimStart !== undefined || config.trimEnd !== undefined) {
      const start = (config.trimStart || 0).toFixed(3);
      const end = (config.trimEnd || 999999).toFixed(3);
      fc.push(`${videoStream}trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v1]`);
      videoStream = '[v1]';
      fc.push(`${audioStream}atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a1]`);
      audioStream = '[a1]';
    }

    if (config.speed && config.speed !== 1) {
      fc.push(`${videoStream}setpts=${(1 / config.speed).toFixed(6)}*PTS[v2]`);
      videoStream = '[v2]';

      let s = config.speed;
      const atempoFilters: string[] = [];
      while (s > 2.0) { atempoFilters.push('atempo=2.0'); s /= 2.0; }
      while (s < 0.5) { atempoFilters.push('atempo=0.5'); s *= 2.0; }
      atempoFilters.push(`atempo=${s.toFixed(6)}`);

      if (atempoFilters.length > 0) {
        fc.push(`${audioStream}${atempoFilters.join(',')}[a2]`);
        audioStream = '[a2]';
      }
    }

    if (config.srtPath && config.includeSubtitles) {
      try {
        const isAss = config.srtPath.toLowerCase().endsWith('.ass');
        const rawSubPath = stripFileProtocol(config.srtPath);

        const { File } = require('expo-file-system');
        const subFile = new File(config.srtPath);

        if (subFile.exists) {
          if (isAss) {
            const escaped = rawSubPath.replace(/\\/g, '/').replace(/'/g, "\\'").replace(/:/g, '\\:');
            fc.push(`${videoStream}ass='${escaped}'[v3]`);
          } else {
            const escaped = rawSubPath.replace(/\\/g, '/').replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:');
            fc.push(`${videoStream}subtitles='${escaped}':force_style='FontSize=48,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,BorderStyle=3,Outline=2'[v3]`);
          }
          videoStream = '[v3]';
        } else {
          console.warn('[FFmpeg] Subtitle file not found, skipping:', rawSubPath);
        }
      } catch (e) {
        console.warn('[FFmpeg] Subtitles filter failed, skipping:', e);
      }
    }

    if (!isPremium && config.watermark) {
      fc.push(`${videoStream}drawtext=text='Made with SlitzCut':x=w-tw-20:y=h-th-20:fontsize=24:fontcolor=white@0.6[v4]`);
      videoStream = '[v4]';
    }

    const volVal = Math.max(0, Math.min(2, (config.audioVolume ?? 100) / 100));
    const finalVol = volVal.toFixed(4);
    const audioFilters: string[] = [`volume=${finalVol}`];

    if (config.fadeIn) {
      audioFilters.push(`afade=t=in:st=0:d=1`);
    }
    if (config.fadeOut && estimatedDuration > 2) {
      audioFilters.push(`afade=t=out:st=${Math.max(0, estimatedDuration - 1).toFixed(3)}:d=1`);
    }

    fc.push(`${audioStream}${audioFilters.join(',')}[a_orig]`);

    if (config.musicPath && musicInputIdx >= 0 && config.musicVolume !== undefined) {
      const mVol = Math.max(0, Math.min(2, config.musicVolume / 100)).toFixed(4);
      const musicFilters: string[] = [`volume=${mVol}`];

      if (config.fadeIn) musicFilters.push(`afade=t=in:st=0:d=1`);
      if (config.fadeOut && estimatedDuration > 2) {
        musicFilters.push(`afade=t=out:st=${Math.max(0, estimatedDuration - 1).toFixed(3)}:d=1`);
      }

      fc.push(`[${musicInputIdx}:a]${musicFilters.join(',')}[a_music]`);
      fc.push(`[a_orig][a_music]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[outa]`);
    } else {
      fc.push(`[a_orig]volume=1.0[outa]`);
    }

    const filterComplex = fc.join(';');
    console.log('[FFmpeg] Final filter_complex:', filterComplex);

    args.push(
      '-filter_complex', filterComplex,
      '-map', videoStream,
      '-map', '[outa]',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-b:v', is4K ? '10M' : '5M',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-shortest',
      '-y',
      rawOutputPath
    );

    console.log('[FFmpeg] Args:', JSON.stringify(args, null, 2));

    FFmpegKitConfig.enableStatisticsCallback((stats: Statistics) => {
      const timeMs = stats.getTime();
      if (timeMs > 0 && estimatedDuration > 0) {
        const progress = Math.min(0.9, (timeMs / 1000) / estimatedDuration);
        onProgress?.(0.1 + progress * 0.8, 'Encoding...');
      }
    });

    const session = await FFmpegKit.executeWithArguments(args);
    const returnCode = await session.getReturnCode();

    FFmpegKitConfig.enableStatisticsCallback(null as any);

    if (ReturnCode.isSuccess(returnCode)) {
      onProgress?.(1, 'Complete');
      return outputPath;
    } else {
      const output = await this.getSessionOutput(session);
      console.error('[FFmpeg] Export FAILED.\nDetails:', output);
      throw new Error(`FFmpeg export failed:\n${output}`);
    }
  }

  async checkSystem(): Promise<{ success: boolean; version: string; error?: string }> {
    try {
      const session = await FFmpegKit.execute("-version");
      const returnCode = await session.getReturnCode();
      const logs = await session.getLogs();
      const output = logs.map((l: Log) => l.getMessage()).join('\n');

      if (ReturnCode.isSuccess(returnCode)) {
        this._nativeAvailable = true;
        return {
          success: true,
          version: output.split('\n')[0]
        };
      } else {
        this._nativeAvailable = false;
        const failStack = await session.getFailStackTrace();
        return {
          success: false,
          version: "Bilinmiyor",
          error: failStack || "FFmpeg native bridge hatası."
        };
      }
    } catch (err: any) {
      this._nativeAvailable = false;
      const isExpoGo = err?.message?.includes('getLogLevel') || err?.message?.includes('null');
      return {
        success: false,
        version: "Hata",
        error: isExpoGo
          ? "Expo Go desteklenmiyor. 'npx expo run:ios' veya 'npx expo run:android' ile native build yapın."
          : err.message
      };
    }
  }

  async getVideoInfo(videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
    hasAudio: boolean;
    hasVideo: boolean;
    rawOutput?: string;
  }> {
    await this.ensureLogCallback();
    try {
      const absVideoPath = stripFileProtocol(ensureAbsolute(videoPath));

      // FIX: -i ile birlikte -f null - kullan, yoksa bazı platformlarda
      // log satırları session'a düşmeden önce session kapanabiliyor.
      // Ayrıca global buffer'ı temizle ki bu probe'a ait logları yakalayalım
      FFmpegService.lastGlobalLogs = [];

      const session = await FFmpegKit.executeWithArguments([
        '-i', absVideoPath,
        '-hide_banner',
      ]);

      const logs = await session.getLogs();
      let output = logs.map((l: Log) => l.getMessage()).join('\n');

      // FIX: Session log boşsa global buffer'dan al
      if (!output || output.trim().length === 0) {
        output = FFmpegService.lastGlobalLogs.join('\n');
        console.warn('[FFmpeg] getVideoInfo: session logs empty, using global buffer. Lines:', FFmpegService.lastGlobalLogs.length);
      }

      console.log('[FFmpeg] getVideoInfo raw output (first 500 chars):', output.substring(0, 500));

      // FIX: Büyük/küçük harf farkı olmadan, "Stream #x:y: Audio:" formatını da yakala
      // Eski: output.toLowerCase().includes('audio:')  ← "audio:" yerine "Audio: aac" gibi gelebilir
      // Yeni: Stream satırını regex ile ara — bu FFmpeg'in kesin çıktı formatıdır
      const hasAudio = /Stream\s+#\d+:\d+.*?:\s*Audio:/i.test(output) ||
        output.toLowerCase().includes('audio:');

      const hasVideo = /Stream\s+#\d+:\d+.*?:\s*Video:/i.test(output) ||
        output.toLowerCase().includes('video:');

      console.log(`[FFmpeg] getVideoInfo — hasAudio: ${hasAudio}, hasVideo: ${hasVideo}`);

      const durationMatch = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d+)/);
      let duration = 0;
      if (durationMatch) {
        duration =
          parseInt(durationMatch[1]) * 3600 +
          parseInt(durationMatch[2]) * 60 +
          parseInt(durationMatch[3]) +
          parseInt(durationMatch[4]) / Math.pow(10, durationMatch[4].length);
      }

      const resMatch = output.match(/(\d{2,5})x(\d{2,5})/);
      const w = resMatch ? parseInt(resMatch[1]) : 1080;
      const h = resMatch ? parseInt(resMatch[2]) : 1920;

      const fpsMatch = output.match(/(\d+(?:\.\d+)?)\s*fps/);
      const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 30;

      return { duration, width: w, height: h, fps, hasAudio, hasVideo, rawOutput: output };
    } catch (err) {
      console.error('[FFmpeg] getVideoInfo failed for path:', videoPath, err);
      throw new Error(`Cannot read video info (PROBE FAILED).\nPath: ${videoPath}\nError: ${err}`);
    }
  }

  async clearCache(): Promise<void> {
    try {
      const cacheDir = new Directory(Paths.cache);
      if (cacheDir.exists) {
        try { cacheDir.delete(); } catch { }
      }
      console.log('[FFmpeg] Cache cleared.');
    } catch (err) {
      console.warn('[FFmpeg] Cache clear failed', err);
    }
  }
}

export const ffmpegService = FFmpegService.getInstance();