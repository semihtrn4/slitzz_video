import type { SubtitleStyle, Language, BackgroundTrack, AspectRatio } from '../types';

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  preset: 'classic',
  fontFamily: 'System',
  fontSize: 24,
  textColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.5,
  position: 'bottom',
  animation: 'none',
  bold: true,
  outline: true,
  outlineColor: '#000000',
};

export const SUBTITLE_PRESETS: Record<string, SubtitleStyle> = {
  classic: {
    preset: 'classic',
    fontFamily: 'System',
    fontSize: 24,
    textColor: '#FFFFFF',
    backgroundColor: 'transparent',
    backgroundOpacity: 0,
    position: 'bottom',
    animation: 'none',
    bold: true,
    outline: true,
    outlineColor: '#000000',
  },
  netflix: {
    preset: 'netflix',
    fontFamily: 'System',
    fontSize: 22,
    textColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.6,
    position: 'bottom',
    animation: 'fade',
    bold: true,
    outline: false,
    outlineColor: '#000000',
  },
  tiktok: {
    preset: 'tiktok',
    fontFamily: 'System',
    fontSize: 28,
    textColor: '#FCD34D',
    backgroundColor: 'transparent',
    backgroundOpacity: 0,
    position: 'bottom',
    animation: 'pop',
    bold: true,
    outline: true,
    outlineColor: '#000000',
  },
  neon: {
    preset: 'neon',
    fontFamily: 'System',
    fontSize: 26,
    textColor: '#22D3EE',
    backgroundColor: 'transparent',
    backgroundOpacity: 0,
    position: 'middle',
    animation: 'fade',
    bold: true,
    outline: true,
    outlineColor: '#0891B2',
  },
  minimal: {
    preset: 'minimal',
    fontFamily: 'System',
    fontSize: 18,
    textColor: '#A0A0A0',
    backgroundColor: 'transparent',
    backgroundOpacity: 0,
    position: 'bottom',
    animation: 'none',
    bold: false,
    outline: false,
    outlineColor: '#000000',
  },
  karaoke: {
    preset: 'karaoke',
    fontFamily: 'System',
    fontSize: 24,
    textColor: '#FFFFFF',
    backgroundColor: '#7C3AED',
    backgroundOpacity: 0.3,
    position: 'bottom',
    animation: 'slideUp',
    bold: true,
    outline: false,
    outlineColor: '#000000',
  },
};

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
];

export const FONT_OPTIONS = [
  { label: 'System', value: 'System' },
  { label: 'Bold', value: 'System-Bold' },
  { label: 'Serif', value: 'Georgia' },
  { label: 'Monospace', value: 'Courier' },
];

export const BACKGROUND_TRACKS: BackgroundTrack[] = [
  { id: '1', name: 'Upbeat Pop', artist: 'BlitzCut', path: 'builtin://upbeat', duration: 180 },
  { id: '2', name: 'Lo-Fi Chill', artist: 'BlitzCut', path: 'builtin://lofi', duration: 240 },
  { id: '3', name: 'Epic Cinematic', artist: 'BlitzCut', path: 'builtin://epic', duration: 200 },
  { id: '4', name: 'Tropical House', artist: 'BlitzCut', path: 'builtin://tropical', duration: 190 },
  { id: '5', name: 'Acoustic Vibes', artist: 'BlitzCut', path: 'builtin://acoustic', duration: 210 },
  { id: '6', name: 'Electronic Beat', artist: 'BlitzCut', path: 'builtin://electronic', duration: 175 },
];

export const ASPECT_RATIOS: { label: string; value: AspectRatio; icon: string; description: string }[] = [
  { label: '9:16', value: '9:16' as const, icon: 'Smartphone', description: 'TikTok, Reels, Shorts' },
  { label: '1:1', value: '1:1' as const, icon: 'Square', description: 'Instagram Feed' },
  { label: '4:5', value: '4:5' as const, icon: 'RectangleVertical', description: 'Instagram Portrait' },
  { label: '16:9', value: '16:9' as const, icon: 'Monitor', description: 'YouTube, Landscape' },
];

export const SPEED_OPTIONS = [
  { label: '0.5x', value: 0.5 },
  { label: '0.75x', value: 0.75 },
  { label: '1x', value: 1 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2 },
];
