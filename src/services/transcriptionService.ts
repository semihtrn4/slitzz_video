// @ts-ignore
import { Directory, Paths, File } from 'expo-file-system';
// Legacy API — createDownloadResumable progress callback için gerekli
import * as FileSystem from 'expo-file-system/legacy';
import type { SubtitleSegment } from '../types';
import { getPath, ensureAbsolute, stripFileProtocol } from '../utils/pathUtils';

export class TranscriptionService {
  private static instance: TranscriptionService;
  private _modelPath: string | null = null;

  static getInstance(): TranscriptionService {
    if (!TranscriptionService.instance) {
      TranscriptionService.instance = new TranscriptionService();
    }
    return TranscriptionService.instance;
  }

  private getModelDir(): string {
    // Eski API (FileSystem.documentDirectory) — file:// URI döndürür, tutarlı
    return (FileSystem.documentDirectory ?? '') + 'models/';
  }

  private getModelPath(): string {
    return this.getModelDir() + 'ggml-base.bin';
  }

  async isModelDownloaded(): Promise<boolean> {
    try {
      const path = this.getModelPath(); // file:// URI
      const info = await FileSystem.getInfoAsync(path, { size: true });
      return info.exists && (info as any).size > 50_000_000;
    } catch {
      return false;
    }
  }

  async downloadModel(onProgress?: (progress: number) => void): Promise<string> {
    const modelDir = this.getModelDir();   // file:// URI
    const modelPath = this.getModelPath(); // file:// URI

    // HuggingFace doğrudan CDN URL — redirect yok, daha güvenilir
    const MODEL_URLS = [
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin?download=true',
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    ];

    // Klasörü oluştur
    await FileSystem.makeDirectoryAsync(modelDir, { intermediates: true }).catch(() => {});

    // Önceki yarım indirmeyi temizle
    await FileSystem.deleteAsync(modelPath, { idempotent: true }).catch(() => {});

    console.log('[Whisper] Downloading model to:', modelPath);
    onProgress?.(0);

    let lastError: any = null;

    for (const MODEL_URL of MODEL_URLS) {
      console.log('[Whisper] Trying URL:', MODEL_URL);
      try {
        const downloadResumable = FileSystem.createDownloadResumable(
          MODEL_URL,
          modelPath,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Accept': 'application/octet-stream',
            },
          },
          (downloadProgress) => {
            const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
            if (totalBytesExpectedToWrite > 0) {
              const progress = totalBytesWritten / totalBytesExpectedToWrite;
              console.log(`[Whisper] Download progress: ${Math.round(progress * 100)}%`);
              onProgress?.(progress);
            } else if (totalBytesWritten > 0) {
              // totalBytesExpectedToWrite bilinmiyorsa tahmini göster (142MB baz alarak)
              const estimated = Math.min(0.99, totalBytesWritten / 148_000_000);
              onProgress?.(estimated);
            }
          }
        );

        const result = await downloadResumable.downloadAsync();
        if (!result?.uri) {
          throw new Error('Download returned no URI');
        }

        // Boyut doğrulama
        const info = await FileSystem.getInfoAsync(modelPath, { size: true });
        console.log('[Whisper] Downloaded size:', (info as any).size);

        if (!info.exists || (info as any).size < 50_000_000) {
          await FileSystem.deleteAsync(modelPath, { idempotent: true }).catch(() => {});
          throw new Error(`File too small: ${(info as any).size ?? 0} bytes (expected ~142MB)`);
        }

        onProgress?.(1);
        console.log('[Whisper] Model verified. Size:', (info as any).size, 'bytes');
        this._modelPath = modelPath;
        return modelPath;

      } catch (err) {
        console.error('[Whisper] URL failed:', MODEL_URL, err);
        lastError = err;
        await FileSystem.deleteAsync(modelPath, { idempotent: true }).catch(() => {});
        // Sonraki URL'yi dene
      }
    }

    throw new Error(`Model indirme başarısız: ${lastError?.message || lastError}`);
  }

  async transcribe(
    audioPath: string,
    language: string,
    onProgress?: (step: string) => void
  ): Promise<SubtitleSegment[]> {
    console.log('[Whisper] Transcribing:', audioPath, 'Language:', language);

    const hasModel = await this.isModelDownloaded();
    if (!hasModel) {
      throw new Error('Whisper model not downloaded');
    }

    let whisper: any;
    try {
      whisper = require('whisper.rn');
    } catch {
      throw new Error('[Whisper] whisper.rn native module not available. Run npx expo prebuild and use a physical device.');
    }

    onProgress?.('Initializing model...');

    let ctx: any;
    try {
      // Model path her zaman ham (file:// prefix'siz) olmalı
      const modelPath = stripFileProtocol(this.getModelPath());
      ctx = await whisper.initWhisper({ filePath: modelPath });
      console.log('[Whisper] Model initialized.');
    } catch (err) {
      throw new Error(`[Whisper] Failed to initialize model: ${err}`);
    }

    onProgress?.('Transcribing audio...');

    // CRITICAL FIX: whisper.rn RAW PATH bekler ama expo-file-system 19/20 URI (file://) bekler.
    const fileUri = ensureAbsolute(audioPath);
    const absAudioPath = stripFileProtocol(fileUri);
    
    console.log('[Whisper] fileUri:', fileUri);
    console.log('[Whisper] Raw audio path:', absAudioPath);

    // Dosya varlığını kontrol et
    try {
      const audioInfo = await FileSystem.getInfoAsync(fileUri, { size: true });
      if (!audioInfo.exists) {
        throw new Error(`Audio file not found at URI: ${fileUri}`);
      }
      console.log('[Whisper] Audio file size:', (audioInfo as any).size, 'bytes');
    } catch (fileErr) {
      throw new Error(`[Whisper] Audio file check failed: ${fileErr}`);
    }

    const { promise } = ctx.transcribe(absAudioPath, {
      language,
      word_timestamps: true,
      onProgress: (p: number) => {
        console.log(`[Whisper] Progress: ${p}%`);
        onProgress?.(`Transcribing... ${p}%`);
      },
    });

    let transcribeResult: any;
    try {
      transcribeResult = await promise;
    } catch (err) {
      throw new Error(`[Whisper] Transcription failed: ${err}`);
    }

    console.log('[Whisper] Raw result (partial):', JSON.stringify(transcribeResult).substring(0, 500));

    onProgress?.('Processing segments...');

    const segments: SubtitleSegment[] = [];
    if (transcribeResult?.segments) {
      transcribeResult.segments.forEach((seg: any, index: number) => {
        const text = seg.text?.trim() || '';
        if (!text || text.match(/^\[.*\]$/)) return;

        segments.push({
          id: `seg_${index}`,
          start: seg.t0 / 100,
          end: seg.t1 / 100,
          text,
          words: seg.words?.map((w: any) => ({
            word: w.word,
            start: w.t0 / 100,
            end: w.t1 / 100,
          }))
        });
      });
    }

    if (segments.length === 0) {
      console.warn('[Whisper] No valid segments found');
      return [];
    }

    const splitSegments = this.splitSegmentsIntoWords(segments);
    onProgress?.('Complete');
    return splitSegments;
  }

  async generateSRT(segments: SubtitleSegment[]): Promise<string> {
    const tempDir = getPath(Paths.cache, 'temp/');
    const dir = new Directory(tempDir);
    if (!dir.exists) {
      dir.create({ intermediates: true });
    }
    const srtPath = getPath(tempDir, `subtitles_${Date.now()}.srt`);
    const srtContent = buildSRTContent(segments);
    const srtFile = new File(srtPath);
    srtFile.write(srtContent);
    return srtPath;
  }

  splitSegmentsIntoWords(segments: SubtitleSegment[]): SubtitleSegment[] {
    const newSegments: SubtitleSegment[] = [];
    let idCounter = 0;

    segments.forEach(seg => {
      if (!seg.words || seg.words.length === 0) {
        const words = seg.text.split(' ');
        if (words.length <= 1) {
          newSegments.push(seg);
        } else {
          const duration = seg.end - seg.start;
          const timePerWord = duration / words.length;
          words.forEach((word, i) => {
            newSegments.push({
              id: `wseg_${idCounter++}`,
              start: seg.start + i * timePerWord,
              end: seg.start + (i + 1) * timePerWord,
              text: word
            });
          });
        }
        return;
      }

      seg.words.forEach(wordObj => {
        const text = wordObj.word.trim();
        if (text) {
          newSegments.push({
            id: `wseg_${idCounter++}`,
            start: wordObj.start,
            end: wordObj.end,
            text
          });
        }
      });
    });

    return newSegments;
  }

  async generateASS(
    segments: SubtitleSegment[],
    style: any,
    resolution: { width: number; height: number }
  ): Promise<string> {
    const assPath = getPath(Paths.cache, `subtitles_${Date.now()}.ass`);

    const convertColor = (hex: string) => {
      const clean = hex.replace('#', '');
      const r = clean.substring(0, 2);
      const g = clean.substring(2, 4);
      const b = clean.substring(4, 6);
      return `&H00${b}${g}${r}`;
    };

    const textColor = convertColor(style.textColor || '#FFFFFF');
    const bgColor = convertColor(style.backgroundColor || '#000000');

    let alignment = 2;
    if (style.position === 'top') alignment = 8;
    else if (style.position === 'middle') alignment = 5;

    const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: ${resolution.width}
PlayResY: ${resolution.height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontFamily || 'Arial'},${style.fontSize || 70},${textColor},&H000000FF,&H00000000,${bgColor},${style.bold ? -1 : 0},0,0,0,100,100,0,0,1,2,2,${alignment},20,20,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const cs = Math.floor((seconds % 1) * 100);
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    };

    let events = '';
    segments.forEach(seg => {
      events += `Dialogue: 0,${formatTime(seg.start)},${formatTime(seg.end)},Default,,0,0,0,,${seg.text}\n`;
    });

    const assFile = new File(assPath);
    assFile.write(assHeader + events);
    return assPath;
  }
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function buildSRTContent(segments: SubtitleSegment[]): string {
  let content = '';
  segments.forEach((segment, index) => {
    content += `${index + 1}\n`;
    content += `${formatSRTTime(segment.start)} --> ${formatSRTTime(segment.end)}\n`;
    content += `${segment.text}\n\n`;
  });
  return content;
}

export function parseSRT(content: string): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  const blocks = content.trim().split(/\n\s*\n/);
  blocks.forEach((block, index) => {
    const lines = block.trim().split('\n');
    if (lines.length < 3) return;
    const timestampLine = lines[1];
    const match = timestampLine.match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
    );
    if (!match) return;
    const start =
      parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 +
      parseInt(match[3]) + parseInt(match[4]) / 1000;
    const end =
      parseInt(match[5]) * 3600 + parseInt(match[6]) * 60 +
      parseInt(match[7]) + parseInt(match[8]) / 1000;
    const text = lines.slice(2).join('\n').trim();
    segments.push({ id: `seg_${index}`, start, end, text });
  });
  return segments;
}

export const transcriptionService = TranscriptionService.getInstance();