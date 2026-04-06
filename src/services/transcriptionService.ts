import * as FileSystem from 'expo-file-system/legacy';
const documentDirectory = (FileSystem as any).documentDirectory;
const cacheDirectory = (FileSystem as any).cacheDirectory;
import type { SubtitleSegment } from '../types';

const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
const MODEL_DIR = (documentDirectory || '') + 'models/';
const MODEL_PATH = MODEL_DIR + 'ggml-base.bin';

export class TranscriptionService {
  private static instance: TranscriptionService;
  private modelPath: string = MODEL_PATH;

  static getInstance(): TranscriptionService {
    if (!TranscriptionService.instance) {
      TranscriptionService.instance = new TranscriptionService();
    }
    return TranscriptionService.instance;
  }

  async isModelDownloaded(): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    return info.exists;
  }

  async downloadModel(onProgress?: (progress: number) => void): Promise<string> {
    const dirInfo = await FileSystem.getInfoAsync(MODEL_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
    }
    console.log('[Whisper] Downloading model...');
    const downloadResumable = FileSystem.createDownloadResumable(
      MODEL_URL,
      MODEL_PATH,
      {},
      (downloadProgress) => {
        const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
        if (totalBytesExpectedToWrite > 0) {
          onProgress?.(totalBytesWritten / totalBytesExpectedToWrite);
        }
      }
    );
    const result = await downloadResumable.downloadAsync();
    if (!result || !result.uri) {
      throw new Error('[Whisper] Download failed: no result returned');
    }
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    if (!info.exists || info.size < 1000000) { // Tiny model en az 30MB civarı, 1MB altı mutlaka hatalıdır
      await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true });
      throw new Error('[Whisper] Download verification failed: file is corrupt or too small');
    }
    this.modelPath = MODEL_PATH;
    console.log('[Whisper] Model downloaded and verified:', MODEL_PATH);
    return MODEL_PATH;
  }

  // Transcribe audio file using whisper.rn (Requirements: 6.1, 6.2, 6.3, 6.6)
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

    onProgress?.('Initializing model...');

    // Native Whisper requires native modules (not available in Expo Go)
    let whisper: any;
    try {
      whisper = require('whisper.rn');
    } catch {
      throw new Error('[Whisper] whisper.rn native module not available. Run npx expo prebuild and use a physical device.');
    }

    onProgress?.('Initializing model...');
    let ctx: any;
    try {
      ctx = await whisper.initWhisper({ filePath: this.modelPath });
      console.log('[Whisper] Model initialized successfully');
    } catch (err) {
      console.error('[Whisper] Initialization error:', err);
      throw new Error(`[Whisper] Failed to initialize model: ${err}`);
    }

    onProgress?.('Transcribing audio...');

    // ctx.transcribe returns { stop, promise }
    const { promise } = ctx.transcribe(audioPath, {
      language,
      word_timestamps: true, // Ensure we get word-level precision
      onProgress: (p: number) => {
        console.log(`[Whisper] Progress: ${p}%`);
        onProgress?.(`Transcribing... ${p}%`);
      },
    });

    const transcribeResult = await promise;
    console.log('[Whisper] Raw Result (partial):', JSON.stringify(transcribeResult).substring(0, 500));
    
    onProgress?.('Processing segments...');

    const segments: SubtitleSegment[] = [];
    if (transcribeResult && transcribeResult.segments) {
      transcribeResult.segments.forEach((seg: any, index: number) => {
        const text = seg.text?.trim() || '';
        // Whisper bazen sadece müzik [MUSIC] veya sessizlik [SILENCE] döndürür, bunları filtreleyelim
        if (!text || text.match(/^\[.*\]$/)) return;
        
        segments.push({
          id: `seg_${index}`,
          // whisper.rn timestamps are in centoseconds
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
      console.warn('[Whisper] No valid segments found after filtering');
      return [];
    }

    // [Pro] Automatically split segments into 1-2 words for the UI and Export
    console.log('[Whisper] Splitting segments into 1-2 words...');
    const splitSegments = this.splitSegmentsIntoWords(segments);

    onProgress?.('Complete');
    return splitSegments;
  }

  // Generate SRT file from segments (Requirements: 6.4, 6.5)
  async generateSRT(segments: SubtitleSegment[]): Promise<string> {
    const tempDir = (FileSystem as any).cacheDirectory + 'temp/';
    const tempDirInfo = await FileSystem.getInfoAsync(tempDir);
    if (!tempDirInfo.exists) {
      await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
    }
    const srtPath = tempDir + `subtitles_${Date.now()}.srt`;
    const srtContent = buildSRTContent(segments);
    await FileSystem.writeAsStringAsync(srtPath, srtContent);
    return srtPath;
  }

  /**
   * Splits long segments into smaller chunks (1-2 words per segment)
   * This is critical for short-form video formats (TikTok/Reels).
   */
  splitSegmentsIntoWords(segments: SubtitleSegment[]): SubtitleSegment[] {
    const newSegments: SubtitleSegment[] = [];
    let idCounter = 0;

    segments.forEach(seg => {
      if (!seg.words || seg.words.length === 0) {
        // Fallback for segments without word-level timestamps
        const words = seg.text.split(' ');
        if (words.length <= 2) {
          newSegments.push(seg);
        } else {
          // Rudimentary splitting if no word-level timestamps available
          const duration = seg.end - seg.start;
          const timePerWord = duration / words.length;
          for (let i = 0; i < words.length; i += 2) {
            const pair = words.slice(i, i + 2).join(' ');
            newSegments.push({
              id: `wseg_${idCounter++}`,
              start: seg.start + (i * timePerWord),
              end: seg.start + (Math.min(i + 2, words.length) * timePerWord),
              text: pair
            });
          }
        }
        return;
      }

      // Pro splitting using actual word timestamps
      for (let i = 0; i < seg.words.length; i += 2) {
        const wordPair = seg.words.slice(i, i + 2);
        const text = wordPair.map(w => w.word.trim()).join(' ');
        newSegments.push({
          id: `wseg_${idCounter++}`,
          start: wordPair[0].start,
          end: wordPair[wordPair.length - 1].end,
          text
        });
      }
    });

    return newSegments;
  }

  /**
   * Generates an Advanced Substation Alpha (.ass) subtitle file.
   * Superior to SRT for precise positioning, coloring, and styling.
   */
  async generateASS(
    segments: SubtitleSegment[],
    style: any,
    resolution: { width: number; height: number }
  ): Promise<string> {
    const assPath = `${cacheDirectory || ''}subtitles_${Date.now()}.ass`;
    
    // Convert hex colors to ASS format (&HBBGGRR&)
    const convertColor = (hex: string) => {
      const r = hex.substring(1, 3);
      const g = hex.substring(3, 5);
      const b = hex.substring(5, 7);
      return `&H00${b}${g}${r}`;
    };

    const textColor = convertColor(style.textColor || '#FFFFFF');
    const bgColor = convertColor(style.backgroundColor || '#000000');
    
    // Position calculation
    // Alignment: 2=bottom, 5=middle, 8=top (numpad layout)
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

    let events = '';
    const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 100);
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
    };

    segments.forEach(seg => {
      events += `Dialogue: 0,${formatTime(seg.start)},${formatTime(seg.end)},Default,,0,0,0,,${seg.text}\n`;
    });

    await FileSystem.writeAsStringAsync(assPath, assHeader + events);
    return assPath;
  }
}

// --- Standalone helpers ---

function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return (
    String(hours).padStart(2, '0') + ':' +
    String(minutes).padStart(2, '0') + ':' +
    String(secs).padStart(2, '0') + ',' +
    String(ms).padStart(3, '0')
  );
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

/**
 * Parse SRT format string into SubtitleSegment[].
 * Exported for round-trip testing (Property 1, Requirements: 6.5).
 */
export function parseSRT(content: string): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  const blocks = content.trim().split(/\n\s*\n/);
  blocks.forEach((block, index) => {
    const lines = block.trim().split('\n');
    if (lines.length < 3) return;
    // Line 1: timestamp line (line 0 is sequence number)
    const timestampLine = lines[1];
    const match = timestampLine.match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
    );
    if (!match) return;
    const start =
      parseInt(match[1]) * 3600 +
      parseInt(match[2]) * 60 +
      parseInt(match[3]) +
      parseInt(match[4]) / 1000;
    const end =
      parseInt(match[5]) * 3600 +
      parseInt(match[6]) * 60 +
      parseInt(match[7]) +
      parseInt(match[8]) / 1000;
    // Lines 2+: text (supports multi-line subtitles)
    const text = lines.slice(2).join('\n').trim();
    segments.push({ id: `seg_${index}`, start, end, text });
  });
  return segments;
}

export const transcriptionService = TranscriptionService.getInstance();


