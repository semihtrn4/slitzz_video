import { combine } from 'zustand/middleware';
import { create } from 'zustand';
import type { 
  Project, 
  SilenceSegment, 
  SubtitleSegment, 
  SubtitleStyle, 
  ExportConfig, 
  SilenceSettings,
  AudioSettings,
  AdjustSettings,
  ProcessingStep 
} from '../types';
import { DEFAULT_SUBTITLE_STYLE } from '../constants/subtitleStyles';

interface EditorState {
  currentProject: Project | null;
  silenceSegments: SilenceSegment[];
  silenceSettings: SilenceSettings;
  subtitleSegments: SubtitleSegment[];
  subtitleStyle: SubtitleStyle;
  isProcessing: boolean;
  processingProgress: number;
  processingStep: ProcessingStep;
  playbackPosition: number;
  isPlaying: boolean;
  exportConfig: Partial<ExportConfig>;
  audioSettings: AudioSettings;
  adjustSettings: AdjustSettings;
}

const defaultSilenceSettings: SilenceSettings = {
  threshold: -40,
  minDuration: 0.5,
  padding: 100,
};

const defaultAudioSettings: AudioSettings = {
  originalVolume: 100,
  musicVolume: 50,
  fadeIn: false,
  fadeOut: false,
};

const defaultAdjustSettings: AdjustSettings = {
  aspectRatio: '9:16',
  speed: 1,
  trimStart: 0,
  trimEnd: 0,
};

const initialState: EditorState = {
  currentProject: null,
  silenceSegments: [],
  silenceSettings: defaultSilenceSettings,
  subtitleSegments: [],
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  isProcessing: false,
  processingProgress: 0,
  processingStep: 'idle',
  playbackPosition: 0,
  isPlaying: false,
  exportConfig: {
    platform: 'tiktok',
    resolution: '1080p',
    fps: 30,
    includeSubtitles: true,
    watermark: true,
    audioVolume: 100,
  },
  audioSettings: defaultAudioSettings,
  adjustSettings: defaultAdjustSettings,
};

export const useEditorStore = create(
  combine(initialState, (set, get) => ({
    setCurrentProject: (project: Project | null) => set({ currentProject: project }),

    setSilenceSegments: (segments: SilenceSegment[]) => set({ silenceSegments: segments }),
    toggleSilenceExcluded: (index: number) => {
      set((state) => ({
        silenceSegments: state.silenceSegments.map((seg, i) =>
          i === index ? { ...seg, excluded: !seg.excluded } : seg
        ),
      }));
    },
    updateSilenceSettings: (settings: Partial<SilenceSettings>) =>
      set((state) => ({
        silenceSettings: { ...state.silenceSettings, ...settings },
      })),

    setSubtitleSegments: (segments: SubtitleSegment[]) => set({ subtitleSegments: segments }),
    updateSubtitleText: (id: string, text: string) => {
      set((state) => ({
        subtitleSegments: state.subtitleSegments.map((seg) =>
          seg.id === id ? { ...seg, text } : seg
        ),
      }));
    },
    deleteSubtitle: (id: string) => {
      set((state) => ({
        subtitleSegments: state.subtitleSegments.filter((seg) => seg.id !== id),
      }));
    },
    setSubtitleStyle: (style: Partial<SubtitleStyle>) =>
      set((state) => ({
        subtitleStyle: { ...state.subtitleStyle, ...style },
      })),
    applyPreset: (presetName: string) => {
      const { SUBTITLE_PRESETS } = require('../constants/subtitleStyles');
      const preset = SUBTITLE_PRESETS[presetName];
      if (preset) {
        set({ subtitleStyle: preset });
      }
    },

    setProcessing: (isProcessing: boolean) => set({ isProcessing }),
    setProcessingProgress: (processingProgress: number) => set({ processingProgress }),
    setProcessingStep: (processingStep: ProcessingStep) => set({ processingStep }),

    setPlaybackPosition: (playbackPosition: number) => set({ playbackPosition }),
    setIsPlaying: (isPlaying: boolean) => set({ isPlaying }),

    updateExportConfig: (config: Partial<ExportConfig>) =>
      set((state) => ({
        exportConfig: { ...state.exportConfig, ...config },
      })),

    updateAudioSettings: (settings: Partial<AudioSettings>) =>
      set((state) => ({
        audioSettings: { ...state.audioSettings, ...settings },
      })),

    updateAdjustSettings: (settings: Partial<AdjustSettings>) =>
      set((state) => ({
        adjustSettings: { ...state.adjustSettings, ...settings },
      })),

    resetEditor: () => set(initialState),
    
    getCurrentProject: () => get().currentProject,
  }))
);
