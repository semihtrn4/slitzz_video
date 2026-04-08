import { Directory, Paths, File } from 'expo-file-system';
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
    return getPath(Paths.document, 'models/');
  }

  private getModelPath(): string {
    return getPath(this.getModelDir(), 'ggml-base.bin');
  }

  async isModelDownloaded(): Promise<boolean> {
    try {
      const path = this.getModelPath();
      const f = new File(path);
      return f.exists;
    } catch {
      return false;
    }
  }

  async downloadModel(onProgress?: (progress: number) => void): Promise<string> {
    const modelDir = this.getModelDir();
    const modelPath = this.getModelPath();
    const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';

    const dir = new Directory(modelDir);
    if (!dir.exists) {
      dir.create({ intermediates: true });
    }
    
    console.log('[Whisper] Downloading model to:', modelPath);
    onProgress?.(0.1); // Indication of start

    const targetFile = new File(modelPath);
    try {
      // Use modern download API with headers to pass HuggingFace potential protections
      await File.downloadFileAsync(MODEL_URL, targetFile, {
        headers: {
          'User-Agent': 'BlitzCut-App/1.0',
        }
      });
      onProgress?.(1);
    } catch (err) {
      console.error('[Whisper] Download error:', err);
      throw new Error(`[Whisper] Download failed: ${err}`);
    }

    if (!targetFile.exists || targetFile.size < 1000000) {
      try { targetFile.delete(); } catch { /* ignore */ }
      throw new Error('[Whisper] Download verification failed: file is corrupt or too small');
    }
    this._modelPath = modelPath;
    console.log('[Whisper] Model downloaded and verified:', modelPath);
    return modelPath;
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
      const modelPath = this.getModelPath();
      ctx = await whisper.initWhisper({ filePath: modelPath });
      console.log('[Whisper] Model initialized successfully');
    } catch (err) {
      console.error('[Whisper] Initialization error:', err);
      throw new Error(`[Whisper] Failed to initialize model: ${err}`);
    }

    onProgress?.('Transcribing audio...');

    // Ensure audioPath is absolute and raw for native whisper
    const absAudioPath = stripFileProtocol(ensureAbsolute(audioPath));

    // ctx.transcribe returns { stop, promise }
    const { promise } = ctx.transcribe(absAudioPath, {
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

    // [Pro] Automatically split segments into 1 word for the UI and Export
    console.log('[Whisper] Splitting segments into 1 words...');
    const splitSegments = this.splitSegmentsIntoWords(segments);

    onProgress?.('Complete');
    return splitSegments;
  }

  // Generate SRT file from segments (Requirements: 6.4, 6.5)
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

  /**
   * Splits long segments into smaller chunks (1 word per segment)
   * This is critical for short-form video formats (TikTok/Reels).
   */
  splitSegmentsIntoWords(segments: SubtitleSegment[]): SubtitleSegment[] {
    const newSegments: SubtitleSegment[] = [];
    let idCounter = 0;

    segments.forEach(seg => {
      if (!seg.words || seg.words.length === 0) {
        // Fallback for segments without word-level timestamps
        const words = seg.text.split(' ');
        if (words.length <= 1) {
          newSegments.push(seg);
        } else {
          // Rudimentary splitting if no word-level timestamps available
          const duration = seg.end - seg.start;
          const timePerWord = duration / words.length;
          for (let i = 0; i < words.length; i += 1) {
            const word = words[i];
            newSegments.push({
              id: `wseg_${idCounter++}`,
              start: seg.start + (i * timePerWord),
              end: seg.start + ((i + 1) * timePerWord),
              text: word
            });
          }
        }
        return;
      }

      // Pro splitting using actual word timestamps
      for (let i = 0; i < seg.words.length; i += 1) {
        const wordObj = seg.words[i];
        const text = wordObj.word.trim();
        if (text) {
          newSegments.push({
            id: `wseg_${idCounter++}`,
            start: wordObj.start,
            end: wordObj.end,
            text
          });
        }
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
    const assPath = getPath(Paths.cache, `subtitles_${Date.now()}.ass`);
    
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

    const assFile = new File(assPath);
    assFile.write(assHeader + events);
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


