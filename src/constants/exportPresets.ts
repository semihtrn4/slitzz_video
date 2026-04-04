import type { ExportConfig } from '../types';

export interface PlatformPreset {
  name: string;
  platform: ExportConfig['platform'];
  resolution: { width: number; height: number };
  fps: 30 | 60;
  description: string;
  icon: string;
}

export const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    name: 'TikTok',
    platform: 'tiktok',
    resolution: { width: 1080, height: 1920 },
    fps: 30,
    description: '1080×1920 • 30fps',
    icon: 'Music',
  },
  {
    name: 'Instagram Reels',
    platform: 'reels',
    resolution: { width: 1080, height: 1920 },
    fps: 30,
    description: '1080×1920 • 30fps',
    icon: 'Camera',
  },
  {
    name: 'YouTube Shorts',
    platform: 'shorts',
    resolution: { width: 1080, height: 1920 },
    fps: 60,
    description: '1080×1920 • 60fps',
    icon: 'Play',
  },
  {
    name: 'Custom',
    platform: 'custom',
    resolution: { width: 1080, height: 1920 },
    fps: 30,
    description: 'Choose your own settings',
    icon: 'Settings',
  },
];

export const RESOLUTION_OPTIONS = [
  { label: '720p HD', value: '720p' as const, width: 720, height: 1280, premium: false },
  { label: '1080p FHD', value: '1080p' as const, width: 1080, height: 1920, premium: false },
  { label: '4K UHD', value: '4k' as const, width: 2160, height: 3840, premium: true },
];

export const FPS_OPTIONS = [
  { label: '30 fps', value: 30 as const },
  { label: '60 fps', value: 60 as const },
];

export const FREE_PLAN_LIMITS = {
  maxProjects: 3,
  maxExportDuration: 60,
  watermark: true,
  allowedSubtitleStyles: ['classic'] as const,
  silenceRemovalMaxDuration: 30,
  allowBackgroundMusic: false,
  allow4KExport: false,
};

export const PRICING = {
  monthly: {
    price: 6.99,
    period: 'month',
    label: 'Monthly',
  },
  yearly: {
    price: 29.99,
    period: 'year',
    label: 'Yearly',
    savings: '64%',
    trialDays: 3,
  },
};
