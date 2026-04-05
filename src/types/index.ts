export interface Project {
  id: string;
  name: string;
  originalVideoPath: string;
  processedVideoPath?: string;
  thumbnailPath?: string;
  duration: number;
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'processing' | 'exported';
}

export interface SilenceSegment {
  start: number;
  end: number;
  duration: number;
  excluded: boolean;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface SubtitleSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: WordTimestamp[];
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration: number;
}

export interface SubtitleStyle {
  preset: 'classic' | 'netflix' | 'tiktok' | 'neon' | 'minimal' | 'karaoke';
  fontFamily: string;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  position: 'top' | 'middle' | 'bottom';
  animation: 'none' | 'pop' | 'slideUp' | 'fade';
  bold: boolean;
  outline: boolean;
  outlineColor: string;
}

export interface ExportConfig {
  videoPath: string;
  platform: 'tiktok' | 'reels' | 'shorts' | 'custom';
  aspectRatio?: AspectRatio;
  resolution: '720p' | '1080p' | '4k';
  fps: 30 | 60;
  includeSubtitles: boolean;
  srtPath?: string;
  subtitleStyle?: SubtitleStyle;
  watermark: boolean;
  audioVolume: number;
  musicPath?: string;
  musicVolume?: number;
  trimStart?: number;
  trimEnd?: number;
  speed?: number;
}

export interface TimeSegment {
  start: number;
  end: number;
}

export interface SilenceSettings {
  threshold: number;
  minDuration: number;
  padding: number;
}

export interface AudioSettings {
  originalVolume: number;
  musicPath?: string;
  musicVolume: number;
  fadeIn: boolean;
  fadeOut: boolean;
}

export interface AdjustSettings {
  aspectRatio: '9:16' | '1:1' | '4:5' | '16:9';
  speed: 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;
  trimStart: number;
  trimEnd: number;
}

export type LanguageCode = 'en' | 'tr' | 'es' | 'fr' | 'de' | 'ar' | 'it' | 'pt' | 'ru' | 'ja' | 'ko' | 'zh';

export interface Language {
  code: LanguageCode;
  name: string;
  flag: string;
}

export type PlanType = 'free' | 'monthly' | 'yearly';

export type Resolution = '720p' | '1080p' | '4k';
export type AspectRatio = '9:16' | '1:1' | '4:5' | '16:9';

export interface SubscriptionState {
  isPremium: boolean;
  plan: PlanType;
}

export type ProcessingStep = 
  | 'idle'
  | 'extracting-audio'
  | 'detecting-silences'
  | 'transcribing'
  | 'generating-subtitles'
  | 'applying-cuts'
  | 'burning-subtitles'
  | 'encoding'
  | 'exporting'
  | 'complete'
  | 'error';

export interface BackgroundTrack {
  id: string;
  name: string;
  artist: string;
  path: string;
  duration: number;
}
