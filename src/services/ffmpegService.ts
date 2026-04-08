// @ts-ignore
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
    const absVideoPath = stripFileProtocol(ensureAbsolute(videoPath));
    const info = await this.getVideoInfo(absVideoPath);
    const hasAudio = info.hasAudio;
    const hasVideo = info.hasVideo;

    let filter = '';
    let streams = '';

    if (hasVideo && hasAudio) {
      keepSegments.forEach((seg, i) => {
        filter += `[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]; `;
        filter += `[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]; `;
        streams += `[v${i}][a${i}]`;
      });
      filter += `${streams}concat=n=${keepSegments.length}:v=1:a=1[vout][aout]`;

      const session = await FFmpegKit.execute(
        `-i "${absVideoPath}" -filter_complex "${filter}" -map "[vout]" -map "[aout]" -c:v libx264 -preset superfast -y "${rawOutputPath}"`
      );
      if (ReturnCode.isSuccess(await session.getReturnCode())) return outputPath;
      const logs = await session.getLogs();
      throw new Error(`FFmpeg silence removal failed (Audio+Video): ${logs[logs.length - 1]?.getMessage()}`);

    } else if (hasVideo && !hasAudio) {
      keepSegments.forEach((seg, i) => {
        filter += `[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]; `;
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
        filter += `[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]; `;
        streams += `[a${i}]`;
      });
      filter += `${streams}concat=n=${keepSegments.length}:v=0:a=1[aout]`;

      const session = await FFmpegKit.execute(
        `-i "${absVideoPath}" -filter_complex "${filter}" -map "[aout]" -c:a aac -y "${rawOutputPath}"`
      );
      if (ReturnCode.isSuccess(await session.getReturnCode())) return outputPath;
      const logs = await session.getLogs();
      throw new Error(`FFmpeg silence removal failed (Audio Only): ${logs[logs.length - 1]?.getMessage()}`);

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

    const outputPath = getPath(exportsDir, `BlitzCut_${Date.now()}.mp4`);
    const rawOutputPath = stripFileProtocol(outputPath);
    onProgress?.(0.1, 'Preparing export...');

    const rawInputPath = stripFileProtocol(ensureAbsolute(config.videoPath));
    const info = await this.getVideoInfo(rawInputPath);
    const hasAudio = info.hasAudio;
    const hasVideo = info.hasVideo;

    console.log(`[FFmpeg] hasAudio: ${hasAudio}, hasVideo: ${hasVideo}, duration: ${info.duration}`);

    let preciseDuration = config.trimEnd
      ? config.trimEnd - (config.trimStart || 0)
      : (info.duration || 999);
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

    // ─── FİLTER COMPLEX OLUŞTURMA ───────────────────────────────────────────
    // KURAL: video akışları [vN], ses akışları [aN] ile adlandırılır. Karışma olmaz.
    let filterComplex = '';
    let videoStream = '';
    let audioStream = '';

    // ── 1. VİDEO KAYNAĞI ──
    if (!hasVideo) {
      filterComplex += `color=c=black:s=${width}x${height}:r=30:d=${preciseDuration.toFixed(2)}[v0]; `;
      videoStream = '[v0]';
    } else {
      filterComplex += `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v0]; `;
      videoStream = '[v0]';
    }

    // ── 2. SES KAYNAĞI ──
    if (!hasAudio) {
      filterComplex += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${preciseDuration.toFixed(2)}[a0]; `;
      audioStream = '[a0]';
    } else {
      filterComplex += `[0:a]anull[a0]; `;
      audioStream = '[a0]';
    }

    // ── 3. TRIM ──
    if (config.trimStart !== undefined || config.trimEnd !== undefined) {
      const start = config.trimStart || 0;
      const end = config.trimEnd || 999999;

      filterComplex += `${videoStream}trim=start=${start.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS[v1]; `;
      videoStream = '[v1]';

      filterComplex += `${audioStream}atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS[a1]; `;
      audioStream = '[a1]';
    }

    // ── 4. SPEED ──
    if (config.speed && config.speed !== 1) {
      filterComplex += `${videoStream}setpts=${(1 / config.speed).toFixed(4)}*PTS[v2]; `;
      videoStream = '[v2]';

      let s = config.speed;
      let atempoChain = '';
      while (s > 2.0) { atempoChain += 'atempo=2.0,'; s /= 2.0; }
      while (s < 0.5) { atempoChain += 'atempo=0.5,'; s *= 2.0; }
      atempoChain += `atempo=${s.toFixed(4)}`;

      filterComplex += `${audioStream}${atempoChain}[a2]; `;
      audioStream = '[a2]';
    }

    // ── 5. SUBTITLES ──
    if (config.srtPath && config.includeSubtitles) {
      const rawSrtPath = stripFileProtocol(config.srtPath);
      const srtEscaped = rawSrtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      filterComplex += `${videoStream}subtitles='${srtEscaped}'[v3]; `;
      videoStream = '[v3]';
    }

    // ── 6. WATERMARK ──
    if (!isPremium && config.watermark) {
      filterComplex += `${videoStream}drawtext=text='Made with BlitzCut':x=w-tw-20:y=h-th-20:fontsize=24:fontcolor=white@0.5[v4]; `;
      videoStream = '[v4]';
    }

    // ── 7. SES: volume + fade ──
    const finalVol = (config.audioVolume / 100).toFixed(4);
    let audioFilter = `volume=${finalVol}`;

    if (config.fadeIn) {
      audioFilter += `,afade=t=in:st=0:d=1`;
    }
    if (config.fadeOut && estimatedDuration > 1) {
      const fadeOutStart = Math.max(0, estimatedDuration - 1);
      audioFilter += `,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=1`;
    }

    // ÖNEMLİ FIX: ses akışı [aN] → [a_orig] (video stream adıyla karışmaz)
    filterComplex += `${audioStream}${audioFilter}[a_orig]; `;

    // ── 8. MÜZİK MİX ──
    if (config.musicPath && config.musicVolume !== undefined) {
      const mVol = (config.musicVolume / 100).toFixed(4);
      let musicFilter = `volume=${mVol}`;

      if (config.fadeIn) {
        musicFilter += `,afade=t=in:st=0:d=1`;
      }
      if (config.fadeOut && estimatedDuration > 1) {
        const fadeOutStart = Math.max(0, estimatedDuration - 1);
        musicFilter += `,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=1`;
      }

      // Müzik inputu her zaman [1:a] — stream_loop ile eklendi
      filterComplex += `[1:a]${musicFilter}[a_music]; `;
      filterComplex += `[a_orig][a_music]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[outa]`;
    } else {
      // Müzik yok → sadece orijinal ses
      filterComplex += `[a_orig]anull[outa]`;
    }

    // ─── ARG LİSTESİ ────────────────────────────────────────────────────────
    const args: string[] = ['-i', rawInputPath];

    if (config.musicPath) {
      const absMusicPath = stripFileProtocol(ensureAbsolute(config.musicPath));
      args.push('-stream_loop', '-1', '-i', absMusicPath);
    }

    args.push(
      '-filter_complex', filterComplex,
      '-map', videoStream,   // son video akışı (örn. [v4])
      '-map', '[outa]',      // karıştırılmış ses akışı
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-b:v', is4K ? '10M' : '5M',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-y',
      rawOutputPath
    );

    console.log('[FFmpeg] Export args:', JSON.stringify(args, null, 2));
    console.log('[FFmpeg] filter_complex:\n', filterComplex);

    // ─── PROGRESS ───────────────────────────────────────────────────────────
    FFmpegKitConfig.enableStatisticsCallback((stats: Statistics) => {
      const timeMs = stats.getTime();
      if (timeMs > 0 && estimatedDuration > 0) {
        const progress = Math.min(0.9, (timeMs / 1000) / estimatedDuration);
        onProgress?.(0.1 + progress * 0.8, 'Encoding...');
      }
    });

    const session = await FFmpegKit.executeWithArguments(args);
    const returnCode = await session.getReturnCode();

    FFmpegKitConfig.enableStatisticsCallback(undefined);

    if (ReturnCode.isSuccess(returnCode)) {
      onProgress?.(1, 'Complete');
      return outputPath;
    } else {
      const logs = await session.getLogs();
      const lastLog = logs.length > 0
        ? logs[logs.length - 1].getMessage()
        : (await session.getFailStackTrace()) || 'No log output (Native Crash or Missing Stream)';
      console.error('[FFmpeg] Export failed. Last log:', lastLog);
      console.error('[FFmpeg] Session state:', await session.getState());
      throw new Error(`FFmpeg export failed: ${lastLog}`);
    }
  }

  async getVideoInfo(videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
    hasAudio: boolean;
    hasVideo: boolean;
  }> {
    await this.ensureLogCallback();
    try {
      const absVideoPath = stripFileProtocol(ensureAbsolute(videoPath));
      const session = await FFmpegKit.execute(`-i "${absVideoPath}" -hide_banner`);
      const logs = await session.getLogs();
      const output = logs.map((l: Log) => l.getMessage()).join('\n');

      const hasAudio = output.includes('Audio:');
      const hasVideo = output.includes('Video:');

      const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      let duration = 0;
      if (durationMatch) {
        duration =
          parseInt(durationMatch[1]) * 3600 +
          parseInt(durationMatch[2]) * 60 +
          parseInt(durationMatch[3]) +
          parseInt(durationMatch[4]) / 100;
      }

      const resMatch = output.match(/(\d{2,4})x(\d{2,4})/);
      const w = resMatch ? parseInt(resMatch[1]) : 1080;
      const h = resMatch ? parseInt(resMatch[2]) : 1920;

      const fpsMatch = output.match(/(\d+(?:\.\d+)?) fps/);
      const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 30;

      return { duration, width: w, height: h, fps, hasAudio, hasVideo };
    } catch {
      return { duration: 0, width: 1080, height: 1920, fps: 30, hasAudio: false, hasVideo: false };
    }
  }

  async clearCache(): Promise<void> {
    try {
      console.log('[FFmpeg] Clearing cache...');
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