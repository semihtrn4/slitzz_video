// @ts-ignore
import { FFmpegKit, FFprobeKit, ReturnCode, FFmpegKitConfig, Log, Statistics } from 'ffmpeg-kit-react-native';
import { Directory, Paths } from 'expo-file-system';
import { silenceService } from './silenceService';
import { getPath, ensureAbsolute, stripFileProtocol } from '../utils/pathUtils';
import type { SilenceSegment, TimeSegment, ExportConfig } from '../types';

export class FFmpegService {
  private static instance: FFmpegService;
  private logEnabled: boolean = false;
  private _nativeAvailable: boolean | null = null;

  // Global log buffer — native crash olduğunda son 80 satırı sakla
  // Session.getLogs() boş dönerse bu buffer'dan asıl hata okunabilir
  static lastGlobalLogs: string[] = [];
  private static readonly MAX_GLOBAL_LOGS = 80;

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
      // FFmpegKit null ise bu hata fırlatır
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

    // Log boşsa global buffer'dan son satırları çek
    if (!allLogs && !failStack) {
      const globalBuf = FFmpegService.lastGlobalLogs.slice(-30).join('\n');
      if (globalBuf) {
        return `No session log (Native Crash). Last global logs:\n${globalBuf}`;
      }
      return 'No log output available (Native Crash or Missing Stream)';
    }

    // Version/config header satırlarını atla, sadece hata satırlarını öne çıkar
    const errorLines = logs
      .map((l: any) => l.getMessage() as string)
      .filter((msg: string) =>
        msg.includes('Error') || msg.includes('error') ||
        msg.includes('Invalid') || msg.includes('No such') ||
        msg.includes('matches no') || msg.includes('failed') ||
        msg.includes('Unable') || msg.includes('Could not')
      );

    if (errorLines.length > 0) {
      return `ERRORS:\n${errorLines.join('\n')}`;
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
          // Global buffer'a ekle — max 80 satır tut
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

  // ─────────────────────────────────────────────────────────────────────────
  // getVideoInfo — 3 aşamalı güvenilir ses/video algılama
  //
  // SORUN: Android'de FFmpeg -i komutu stream bilgilerini session log olarak
  // değil, stderr'e yazıyor. session.getLogs() boş dönebilir. Bu yüzden
  // "Stream #0:1: Audio: aac" satırı yakalanamaz ve hasAudio=false olur.
  //
  // ÇÖZÜM: 3 aşamalı yaklaşım:
  //   1. FFprobeKit JSON — en kesin, codec_type field'ı parse edilir
  //   2. FFmpeg -i metin parse — session + global buffer birleştirilir
  //   3. 1 saniyelik ses çıkarma testi — metin parse yanlış sonuç verirse
  //      gerçekten ses çıkarmayı dene, başarılıysa hasAudio=true kesin
  // ─────────────────────────────────────────────────────────────────────────
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
    const absVideoPath = stripFileProtocol(ensureAbsolute(videoPath));

    // ── AŞAMA 1: FFprobeKit JSON (varsa — en güvenilir yöntem) ──────────────
    // FFprobeKit codec_type field'ını JSON olarak döndürür, metin parse gerekmez
    try {
      if (typeof FFprobeKit !== 'undefined' && FFprobeKit !== null) {
        const probeSession = await FFprobeKit.execute(
          `-v quiet -print_format json -show_streams -show_format "${absVideoPath}"`
        );
        const probeLogs = await probeSession.getLogs();
        const probeOutput = probeLogs.map((l: Log) => l.getMessage()).join('');

        if (probeOutput && probeOutput.includes('"codec_type"')) {
          console.log('[FFmpeg] Using FFprobeKit JSON output');
          const parsed = JSON.parse(probeOutput);
          const streams = parsed.streams || [];
          const format = parsed.format || {};

          const audioStream = streams.find((s: any) => s.codec_type === 'audio');
          const videoStream = streams.find((s: any) => s.codec_type === 'video');

          const duration = parseFloat(format.duration || '0') ||
            parseFloat(videoStream?.duration || '0') ||
            parseFloat(audioStream?.duration || '0');

          const w = videoStream ? parseInt(videoStream.width || '1080') : 1080;
          const h = videoStream ? parseInt(videoStream.height || '1920') : 1920;

          const fpsStr = videoStream?.r_frame_rate || '30/1';
          const fpsParts = fpsStr.split('/');
          const fps = fpsParts.length === 2
            ? parseFloat(fpsParts[0]) / parseFloat(fpsParts[1])
            : parseFloat(fpsStr);

          const hasAudio = !!audioStream;
          const hasVideo = !!videoStream;

          console.log(`[FFprobeKit] hasAudio: ${hasAudio}, hasVideo: ${hasVideo}, duration: ${duration}`);
          return { duration, width: w, height: h, fps: fps || 30, hasAudio, hasVideo, rawOutput: probeOutput };
        }
      }
    } catch (probeErr) {
      console.warn('[FFmpeg] FFprobeKit failed or unavailable, falling back to FFmpeg -i:', probeErr);
    }

    // ── AŞAMA 2: FFmpeg -i metin parse ──────────────────────────────────────
    // KRİTİK: Android'de session logları bazen boş gelir.
    // Çözüm: global buffer'ı temizle, -i çalıştır, hem session hem global'den birleştir.
    FFmpegService.lastGlobalLogs = [];

    const infoSession = await FFmpegKit.executeWithArguments(['-hide_banner', '-i', absVideoPath]);
    const infoLogs = await infoSession.getLogs();
    let infoOutput = infoLogs.map((l: Log) => l.getMessage()).join('\n');

    // Session boşsa global buffer'dan al (Android'de sık yaşanır)
    if (!infoOutput || infoOutput.trim().length < 20) {
      infoOutput = FFmpegService.lastGlobalLogs.join('\n');
      console.warn('[FFmpeg] Session logs empty, fallback to global buffer. Chars:', infoOutput.length);
    }

    // Her ikisini birleştir (bazı cihazlarda ikisi de kısmi olabilir)
    const combinedOutput = infoOutput + '\n' + FFmpegService.lastGlobalLogs.join('\n');
    console.log('[FFmpeg] probe combined output (800 chars):', combinedOutput.substring(0, 800));

    // Ses/video stream varlığını regex ile kontrol et
    // "Stream #0:1(und): Audio: aac" formatını ve basit "audio:" formatını yakala
    let hasAudioFromText =
      /Stream\s+#\d+:\d+[^:]*:\s*Audio:/i.test(combinedOutput) ||
      combinedOutput.toLowerCase().includes('audio:');

    const hasVideoFromText =
      /Stream\s+#\d+:\d+[^:]*:\s*Video:/i.test(combinedOutput) ||
      combinedOutput.toLowerCase().includes('video:');

    // Duration — "Duration: 00:01:02.03" formatını parse et
    const durationMatch = combinedOutput.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d+)/);
    let duration = 0;
    if (durationMatch) {
      duration =
        parseInt(durationMatch[1]) * 3600 +
        parseInt(durationMatch[2]) * 60 +
        parseInt(durationMatch[3]) +
        parseInt(durationMatch[4]) / Math.pow(10, durationMatch[4].length);
    }

    // Çözünürlük — "1080x1920" formatını yakala
    const resMatch = combinedOutput.match(/(\d{2,5})x(\d{2,5})/);
    const w = resMatch ? parseInt(resMatch[1]) : 1080;
    const h = resMatch ? parseInt(resMatch[2]) : 1920;

    // FPS — "30 fps" veya "29.97 fps" formatını yakala
    const fpsMatch = combinedOutput.match(/(\d+(?:\.\d+)?)\s*fps/);
    const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 30;

    console.log(`[FFmpeg -i] hasAudio (text): ${hasAudioFromText}, hasVideo: ${hasVideoFromText}`);

    // ── AŞAMA 3: Ses algılanamadıysa 1 saniyelik extract testi ──────────────
    // Android'de log kesilebilir ve metin parse yanlış sonuç verebilir.
    // Gerçekten 1s ses çıkarmayı dene: başarılıysa ses KESİNLİKLE var.
    // Başarısızsa metin parse sonucunu koru (false negative tercih edilir).
    if (!hasAudioFromText) {
      console.log('[FFmpeg] Audio not detected in text, running 1s extract test...');
      try {
        const testPath = getPath(Paths.cache, `audio_test_${Date.now()}.m4a`);
        const rawTestPath = stripFileProtocol(testPath);

        const testSession = await FFmpegKit.executeWithArguments([
          '-i', absVideoPath,
          '-vn',        // video alma, sadece ses
          '-t', '1',    // sadece ilk 1 saniye
          '-c:a', 'aac',
          '-y', rawTestPath
        ]);

        const testCode = await testSession.getReturnCode();

        if (ReturnCode.isSuccess(testCode)) {
          // Dosya oluştu, boyutunu kontrol et (> 100 byte = gerçek ses verisi var)
          try {
            const { File } = require('expo-file-system');
            const testFile = new File(testPath);
            if (testFile.exists && testFile.size > 100) {
              console.log('[FFmpeg] 1s extract test PASSED — hasAudio=true (overriding text parse)');
              hasAudioFromText = true;
            } else {
              console.log('[FFmpeg] 1s extract test: file too small, hasAudio=false');
            }
          } catch {
            // size check başarısızsa, komut başarılı olduğu için true say
            console.log('[FFmpeg] 1s extract test PASSED (size check skipped) — hasAudio=true');
            hasAudioFromText = true;
          }
        } else {
          console.log('[FFmpeg] 1s extract test FAILED — hasAudio=false confirmed');
        }
      } catch (testErr) {
        console.warn('[FFmpeg] Audio extract test error (non-fatal):', testErr);
      }
    }

    return {
      duration,
      width: w,
      height: h,
      fps,
      hasAudio: hasAudioFromText,
      hasVideo: hasVideoFromText,
      rawOutput: combinedOutput,
    };
  }

  async extractAudio(videoPath: string, forWhisper: boolean = false): Promise<string> {
    await this.ensureLogCallback();
    const ext = forWhisper ? 'wav' : 'm4a';
    const audioPath = getPath(Paths.cache, `extracted_audio_${Date.now()}.${ext}`);
    const absVideoPath = stripFileProtocol(ensureAbsolute(videoPath));

    // Dosya varlığını kontrol et
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
      // Whisper: 16kHz mono PCM WAV
      args = ['-i', absVideoPath, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', rawAudioPath];
    } else {
      // Silence detection: AAC M4A
      args = ['-i', absVideoPath, '-vn', '-c:a', 'aac', '-q:a', '2', '-y', rawAudioPath];
    }

    const session = await FFmpegKit.executeWithArguments(args);
    const returnCode = await session.getReturnCode();

    if (ReturnCode.isSuccess(returnCode)) {
      // forWhisper ise ham path döndür (whisper native modül bunu bekler)
      // normal ise file:// prefix'li döndür (expo-av için)
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

    console.log('=== [EXPORT START] ===');
    console.log(`[Export] hasAudio: ${hasAudio}, hasVideo: ${hasVideo}, duration: ${info.duration}`);
    console.log(`[Export] videoPath: ${rawInputPath}`);
    console.log(`[Export] config: trimStart=${config.trimStart}, trimEnd=${config.trimEnd}, speed=${config.speed}, resolution=${config.resolution}, aspectRatio=${config.aspectRatio}`);
    console.log(`[Export] musicPath: ${config.musicPath || 'none'}, audioVolume: ${config.audioVolume}, includeSubtitles: ${config.includeSubtitles}`);

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

    // ─── INPUT INDEX PLANI ───────────────────────────────────────────────────
    // Ses YOK → input[0]=video, ses filter_complex içinde anullsrc ile üretilir
    // Ses VAR → input[0]=video (ses de burada)
    // Müzik VAR → input[1]
    //
    // NOT: Eski kod 'hasAudio=false' durumunda anullsrc'yi ayrı input olarak
    // veriyordu (-f lavfi -i anullsrc). Bu Android'de native crash yapıyor.
    // Yeni yaklaşım: anullsrc filter_complex İÇİNDE source node olarak tanımlanır.

    const args: string[] = [];
    args.push('-i', rawInputPath);           // Her zaman input[0] = video dosyası
    const videoIdx = 0;                       // Video her zaman input 0

    let musicInputIdx = -1;
    if (config.musicPath) {
      const absMusicPath = stripFileProtocol(ensureAbsolute(config.musicPath));
      args.push('-stream_loop', '-1', '-i', absMusicPath);
      musicInputIdx = 1;                      // Müzik her zaman input 1 (varsa)
    }

    // ─── FILTER COMPLEX ──────────────────────────────────────────────────────
    // KURAL: fc dizisindeki her eleman noktalı virgül ile join edilir.
    // vStream ve aStream değişkenleri aktif stream etiketlerini tutar.
    // vIdx/aIdx her filtre adımında artırılır — isim çakışması olmaz.

    const fc: string[] = [];
    let vStream = '';   // aktif video stream etiketi, örn: [v0], [v1]...
    let aStream = '';   // aktif audio stream etiketi, örn: [a0], [a1]...
    let vIdx = 0;       // video filtre sayacı
    let aIdx = 0;       // audio filtre sayacı

    // ── 1. VİDEO KAYNAĞI ────────────────────────────────────────────────────
    if (!hasVideo) {
      // Video stream yoksa siyah ekran üret
      fc.push(`color=c=black:s=${width}x${height}:r=30:d=${preciseDuration.toFixed(3)}[v${vIdx}]`);
    } else {
      // Video var: ölçekle, padding ekle, SAR düzelt
      fc.push(`[${videoIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${vIdx}]`);
    }
    vStream = `[v${vIdx}]`;

    // ── 2. SES KAYNAĞI ──────────────────────────────────────────────────────
    // KRİTİK: Ses yoksa anullsrc'yi filter_complex IÇINDE tanımla.
    // '-f lavfi -i anullsrc' input olarak vermek Android'de native crash yapıyor.
    // filter_complex içindeki anullsrc source node tamamen güvenli.
    if (hasAudio) {
      // Gerçek ses: video input'unun audio stream'ini al, timestamp sıfırla
      fc.push(`[${videoIdx}:a]asetpts=PTS-STARTPTS[a${aIdx}]`);
    } else {
      // Sahte ses: filter_complex içinde anullsrc source node
      const nullDur = Math.max(estimatedDuration, 1).toFixed(3);
      fc.push(`anullsrc=channel_layout=stereo:sample_rate=44100:d=${nullDur}[a${aIdx}]`);
    }
    aStream = `[a${aIdx}]`;

    // ── 3. TRIM ─────────────────────────────────────────────────────────────
    if (config.trimStart !== undefined || config.trimEnd !== undefined) {
      const start = (config.trimStart || 0).toFixed(3);
      const end = (config.trimEnd || 999999).toFixed(3);

      vIdx++;
      fc.push(`${vStream}trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${vIdx}]`);
      vStream = `[v${vIdx}]`;

      // anullsrc için atrim gereksiz (d= ile süresi zaten ayarlandı)
      // ama gerçek ses için gerekli
      if (hasAudio) {
        aIdx++;
        fc.push(`${aStream}atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${aIdx}]`);
        aStream = `[a${aIdx}]`;
      }
    }

    // ── 4. SPEED ────────────────────────────────────────────────────────────
    if (config.speed && config.speed !== 1) {
      vIdx++;
      fc.push(`${vStream}setpts=${(1 / config.speed).toFixed(6)}*PTS[v${vIdx}]`);
      vStream = `[v${vIdx}]`;

      // atempo max 2.0, min 0.5 — zincir olarak uygula
      let s = config.speed;
      const atempoFilters: string[] = [];
      while (s > 2.0) { atempoFilters.push('atempo=2.0'); s /= 2.0; }
      while (s < 0.5) { atempoFilters.push('atempo=0.5'); s *= 2.0; }
      atempoFilters.push(`atempo=${s.toFixed(6)}`);

      aIdx++;
      fc.push(`${aStream}${atempoFilters.join(',')}[a${aIdx}]`);
      aStream = `[a${aIdx}]`;
    }

    // ── 5. SUBTITLES ────────────────────────────────────────────────────────
    if (config.srtPath && config.includeSubtitles) {
      try {
        const isAss = config.srtPath.toLowerCase().endsWith('.ass');
        // stripFileProtocol ile file:// prefix'ini kaldır — File() ve FFmpeg için
        const rawSubPath = stripFileProtocol(ensureAbsolute(config.srtPath));
        const { File } = require('expo-file-system');
        // Exists kontrolü rawSubPath ile yap (file:// olmadan)
        const subFile = new File(rawSubPath);

        if (subFile.exists) {
          vIdx++;
          if (isAss) {
            // ASS: her platformda daha güvenli
            // Android path'lerinde boşluk ve özel karakter escape
            const escaped = rawSubPath.replace(/\\/g, '/').replace(/'/g, "\\'").replace(/:/g, '\\:');
            fc.push(`${vStream}ass='${escaped}'[v${vIdx}]`);
          } else {
            // SRT: force_style ile
            const escaped = rawSubPath.replace(/\\/g, '/').replace(/'/g, "\\'").replace(/:/g, '\\:');
            fc.push(`${vStream}subtitles='${escaped}':force_style='FontSize=48,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,BorderStyle=3,Outline=2'[v${vIdx}]`);
          }
          vStream = `[v${vIdx}]`;
          console.log(`[FFmpeg] Subtitles added: ${rawSubPath}`);
        } else {
          console.warn('[FFmpeg] Subtitle file not found, skipping:', rawSubPath);
        }
      } catch (e) {
        // Subtitles eklenemezse sessizce devam et — videoyu mahvetme
        console.warn('[FFmpeg] Subtitles filter failed, skipping:', e);
      }
    }

    // ── 6. WATERMARK ────────────────────────────────────────────────────────
    if (!isPremium && config.watermark) {
      vIdx++;
      fc.push(`${vStream}drawtext=text='Made with SlitzCut':x=w-tw-20:y=h-th-20:fontsize=24:fontcolor=white@0.6[v${vIdx}]`);
      vStream = `[v${vIdx}]`;
    }

    // ── 7. SES VOLUME + FADE ────────────────────────────────────────────────
    const volVal = Math.max(0, Math.min(2, (config.audioVolume ?? 100) / 100));
    const finalVol = volVal.toFixed(4);
    const audioFilters: string[] = [`volume=${finalVol}`];

    if (config.fadeIn) {
      audioFilters.push(`afade=t=in:st=0:d=1`);
    }
    if (config.fadeOut && estimatedDuration > 2) {
      audioFilters.push(`afade=t=out:st=${Math.max(0, estimatedDuration - 1).toFixed(3)}:d=1`);
    }

    // ── 8. MÜZİK MİX ───────────────────────────────────────────────────────
    if (config.musicPath && musicInputIdx >= 0 && config.musicVolume !== undefined) {
      // Müzik var: önce [a_orig] ara node'u oluştur, sonra mix
      fc.push(`${aStream}${audioFilters.join(',')}[a_orig]`);

      const mVol = Math.max(0, Math.min(2, config.musicVolume / 100)).toFixed(4);
      const musicFilters: string[] = [`volume=${mVol}`];

      if (config.fadeIn) musicFilters.push(`afade=t=in:st=0:d=1`);
      if (config.fadeOut && estimatedDuration > 2) {
        musicFilters.push(`afade=t=out:st=${Math.max(0, estimatedDuration - 1).toFixed(3)}:d=1`);
      }

      fc.push(`[${musicInputIdx}:a]${musicFilters.join(',')}[a_music]`);
      fc.push(`[a_orig][a_music]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[outa]`);
    } else {
      // Müzik yok: ara node olmadan direkt [outa]'ya bağla
      // [a_orig] → volume=1.0 → [outa] zinciri Android'de kırılıyordu
      fc.push(`${aStream}${audioFilters.join(',')}[outa]`);
    }

    // filter_complex: tüm parçaları ; ile birleştir
    const filterComplex = fc.join(';');

    // DEBUG: Her filter adımını ayrı ayrı logla — hangisinde hata var kolayca görülür
    console.log('[FFmpeg] === FILTER COMPLEX STEPS ===');
    fc.forEach((step, i) => console.log(`[FFmpeg] fc[${i}]: ${step}`));
    console.log('[FFmpeg] === FULL filter_complex ===');
    console.log('[FFmpeg]', filterComplex);
    console.log(`[FFmpeg] vStream final: ${vStream}, aStream final: ${aStream}`);

    // ─── KALAN ARGÜMANLAR ────────────────────────────────────────────────────
    args.push(
      '-filter_complex', filterComplex,
      '-map', vStream,
      '-map', '[outa]',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-b:v', is4K ? '10M' : '5M',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',   // MP4 header'ı başa al — galeri oynatıcılar için kritik
      // NOT: hasAudio=false durumunda -shortest KALDIRILDI.
      // anullsrc süresi zaten preciseDuration kadar ayarlı.
      // -shortest + anullsrc kombinasyonu Android'de native crash yapıyor.
      ...(hasAudio ? ['-shortest'] : []),
      '-y',
      rawOutputPath
    );

    console.log('[FFmpeg] === FULL ARGS ===');
    args.forEach((arg, i) => console.log(`[FFmpeg] args[${i}]: ${arg}`));

    // ─── PROGRESS ────────────────────────────────────────────────────────────
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
      console.log('[FFmpeg] === EXPORT SUCCESS ===');
      console.log(`[FFmpeg] Output: ${rawOutputPath}`);
      return outputPath;
    } else {
      // Tüm session loglarını tek tek yazdır — asıl hata satırını bul
      const sessionLogs = await session.getLogs();
      console.error('[FFmpeg] === EXPORT FAILED ===');
      console.error(`[FFmpeg] Return code: ${await session.getReturnCode()}`);
      sessionLogs.forEach((l: any, i: number) => {
        const msg = l.getMessage();
        // Sadece hata içeren satırları öne çıkar
        if (msg.includes('Error') || msg.includes('error') || msg.includes('Invalid') ||
          msg.includes('No such') || msg.includes('failed') || msg.includes('matches no')) {
          console.error(`[FFmpeg] !! HATA SATIRI [${i}]: ${msg}`);
        } else {
          console.log(`[FFmpeg] log[${i}]: ${msg}`);
        }
      });
      const failStack = await session.getFailStackTrace();
      if (failStack) console.error('[FFmpeg] STACK TRACE:', failStack);
      const output = await this.getSessionOutput(session);
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