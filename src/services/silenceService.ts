import type { SilenceSegment, TimeSegment } from '../types';

export class SilenceService {
  private static instance: SilenceService;

  static getInstance(): SilenceService {
    if (!SilenceService.instance) {
      SilenceService.instance = new SilenceService();
    }
    return SilenceService.instance;
  }

  // Parse ffmpeg silencedetect stderr output
  parseSilenceOutput(stderr: string): SilenceSegment[] {
    const segments: SilenceSegment[] = [];
    const silenceStartRegex = /silence_start: ([\d.]+)/g;
    const silenceEndRegex = /silence_end: ([\d.]+)/g;
    
    const starts: number[] = [];
    const ends: number[] = [];
    
    let match;
    while ((match = silenceStartRegex.exec(stderr)) !== null) {
      starts.push(parseFloat(match[1]));
    }
    
    while ((match = silenceEndRegex.exec(stderr)) !== null) {
      ends.push(parseFloat(match[1]));
    }
    
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i];
      const end = ends[i] || starts[i] + 1;
      segments.push({
        start,
        end,
        duration: end - start,
        excluded: false,
      });
    }
    
    return segments;
  }

  // Compute keep segments (inverse of silence segments)
  computeKeepSegments(
    totalDuration: number,
    silenceSegments: SilenceSegment[],
    padding: number
  ): TimeSegment[] {
    const keepSegments: TimeSegment[] = [];
    let currentTime = 0;
    
    for (const silence of silenceSegments) {
      if (silence.excluded) continue;
      
      const keepEnd = Math.max(0, silence.start - padding / 1000);
      
      if (keepEnd > currentTime) {
        keepSegments.push({
          start: currentTime,
          end: keepEnd,
        });
      }
      
      currentTime = Math.min(totalDuration, silence.end + padding / 1000);
    }
    
    if (currentTime < totalDuration) {
      keepSegments.push({
        start: currentTime,
        end: totalDuration,
      });
    }
    
    return keepSegments;
  }

  // Generate ffmpeg concat list file content
  // videoPath first to match task spec: generateConcatList(videoPath, keepSegments)
  generateConcatList(videoPath: string, keepSegments: TimeSegment[]): string {
    let content = '';
    
    for (const segment of keepSegments) {
      content += `file '${videoPath}'\n`;
      content += `inpoint ${segment.start.toFixed(3)}\n`;
      content += `outpoint ${segment.end.toFixed(3)}\n`;
    }
    
    return content;
  }

  // Estimate time saved by removing silences
  estimateTimeSaved(silenceSegments: SilenceSegment[]): number {
    return silenceSegments
      .filter((s) => !s.excluded)
      .reduce((total, s) => total + s.duration, 0);
  }

  // Format duration for display
  formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  }

  // Format timestamp for display
  formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  }
}

export const silenceService = SilenceService.getInstance();
