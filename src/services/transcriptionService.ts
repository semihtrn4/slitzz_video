import * as FileSystem from 'expo-file-system';
import type { SubtitleSegment, WordTimestamp } from '../types';

const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin';
const FS = FileSystem as any;
const MODEL_PATH = (FS.documentDirectory || '') + 'models/ggml-tiny.bin';
const MODEL_DIR = (FS.documentDirectory || '') + 'models/';

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
      onProgress: (p: number) => {
        console.log(`[Whisper] Progress: ${p}%`);
        onProgress?.(`Transcribing... ${p}%`);
      },
    });

    const transcribeResult = await promise;
    console.log('[Whisper] Transcription complete. Segments:', transcribeResult.segments.length);

    onProgress?.('Complete');

    return transcribeResult.segments.map(
      (
        seg: { t0: number; t1: number; text: string; words?: Array<{ word: string; t0: number; t1: number }> },
        index: number
      ): SubtitleSegment => {
        const subtitleSegment: SubtitleSegment = {
          id: `seg_${index}`,
          // whisper.rn timestamps are in centiseconds
          start: seg.t0 / 100,
          end: seg.t1 / 100,
          text: seg.text.trim(),
        };

        // Populate words for karaoke mode if word-level timestamps are available
        if (seg.words && seg.words.length > 0) {
          subtitleSegment.words = seg.words.map(
            (w): WordTimestamp => ({
              word: w.word,
              start: w.t0 / 100,
              end: w.t1 / 100,
            })
          );
        }

        return subtitleSegment;
      }
    );
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


