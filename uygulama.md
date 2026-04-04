Build a complete React Native mobile app called "BlitzCut" using Expo and TypeScript (bare workflow with expo prebuild). This is a short-form video editor for Instagram Reels, TikTok, and YouTube Shorts.

## TECH STACK
- React Native + Expo (bare workflow, npx expo prebuild)
- TypeScript (strict mode)
- expo-router (file-based navigation)
- NativeWind v4 (Tailwind for styling)
- Zustand (global state)
- react-native-reanimated v3
- react-native-gesture-handler
- ffmpeg-kit-react-native (full-gpl build)
- expo-av (video playback)
- expo-media-library (gallery access)
- expo-document-picker (file import)
- expo-sharing (export & share)
- expo-file-system
- whisper.rn (offline speech-to-text — React Native native module, requires bare workflow)
- @shopify/react-native-skia (subtitle rendering)
- react-native-progress
- expo-haptics
- lottie-react-native
- @react-native-async-storage/async-storage

IMPORTANT: whisper.rn is a React Native package that provides offline on-device speech-to-text using OpenAI's Whisper model. It requires native modules and bare workflow. Use it exactly as documented at https://github.com/mybigday/whisper.rn — initialize with WhisperContext, download the tiny model (~75MB) on first use, and call transcribe() on extracted .wav audio.

---

## APP STRUCTURE (expo-router)

app/
├── (tabs)/
│   ├── _layout.tsx
│   ├── index.tsx          # Home / Projects
│   ├── create.tsx         # Import video
│   └── settings.tsx
├── editor/
│   └── [id].tsx           # Full editor
├── paywall.tsx            # Subscription paywall (UI only, no payment SDK)
├── onboarding.tsx
└── _layout.tsx

src/
├── components/
│   ├── ui/ (Button, Card, Badge, BottomSheet, LoadingOverlay, Toast)
│   ├── editor/ (VideoPlayer, Timeline, WaveformView, SubtitlePreview, SubtitleStylePicker, ToolBar)
│   ├── home/ (ProjectCard, EmptyState)
│   └── paywall/ (PlanCard)
├── hooks/ (useFFmpeg, useSilenceDetection, useTranscription, useVideoEditor, useSubscription)
├── stores/ (projectStore, editorStore, subscriptionStore — Zustand + AsyncStorage)
├── services/ (ffmpegService, silenceService, transcriptionService, exportService)
├── types/index.ts
└── constants/ (subtitleStyles, exportPresets)

---

## DESIGN SYSTEM (Dark UI)

Colors:
  background: '#0A0A0A'
  surface: '#141414'
  surfaceElevated: '#1C1C1C'
  border: '#2A2A2A'
  primary: '#7C3AED'        // Purple accent
  primaryLight: '#8B5CF6'
  accent: '#A78BFA'
  success: '#10B981'
  warning: '#F59E0B'
  danger: '#EF4444'
  textPrimary: '#FFFFFF'
  textSecondary: '#A0A0A0'
  waveformActive: '#7C3AED'
  silenceMarker: '#EF4444'

Components:
- All buttons: border-radius 12px, height 52px (primary), 44px (secondary)
- Cards: rounded-2xl, border 1px #2A2A2A, background #141414
- Bottom sheets: rounded-t-3xl, drag handle
- Tab bar: dark bg, purple active indicator

---

## SCREENS

### 1. ONBOARDING (app/onboarding.tsx)
- 3-step animated carousel with react-native-reanimated
- Step 1: "Record or import your video" (camera icon)
- Step 2: "Auto-remove silences instantly" (waveform animation)
- Step 3: "Add viral subtitles in seconds" (text animation)
- "Get Started" CTA, skip button top-right
- Dot pagination indicator
- Save completion to AsyncStorage

### 2. HOME (app/(tabs)/index.tsx)
- "BlitzCut" logo left, "+" create button right (purple)
- "Recent Projects" horizontal scroll of ProjectCards
- ProjectCard: thumbnail, duration, date, status badge (Draft/Exported)
- "Start New Project" dashed-border import button
- Long press project → action sheet (Rename, Duplicate, Delete)
- Empty state: Lottie animation + "Import your first video" CTA
- Tap card → navigate to editor/[id]

### 3. CREATE (app/(tabs)/create.tsx)
- "Choose from Gallery" — expo-media-library picker
- "Import File" — expo-document-picker (mp4, mov, m4v)
- After selection: thumbnail preview, duration, file size
- "Continue to Editor" → save project → navigate to editor/[id]

### 4. EDITOR (app/editor/[id].tsx) — CORE SCREEN

Layout (top to bottom):
a) Header: back button, editable project name, "Export" button (purple)

b) Video Preview (60% screen height):
   - expo-av Video component
   - Tap to play/pause
   - Time overlay bottom-left
   - Subtitle text overlaid using absolute-positioned Reanimated Text
   - Live subtitle style applied

c) 4-Tab bar: ✂️ Silence | 💬 Subtitles | 🎵 Audio | ⚙️ Adjust

d) Tab Content Panel (scrollable):

SILENCE TAB:
- Toggle: "Auto Remove Silences"
- Slider: "Silence Threshold" (-60dB to -20dB)
- Slider: "Min Silence Length" (0.1s to 2.0s)
- Slider: "Keep buffer around cuts" (0ms to 500ms)
- "Detect Silences" button → ffmpeg silencedetect filter
- List of detected segments: timestamp, duration, include/exclude toggle
- "Apply Cuts" button → ffmpeg concat
- Progress overlay during processing

SUBTITLES TAB:
- Toggle: "Auto Subtitles"
- Language picker (English, Turkish, Spanish, French, German, Arabic...)
- "Transcribe" button → whisper.rn pipeline:
    1. ffmpeg: extract audio to .wav (16kHz mono pcm_s16le)
    2. whisper.rn: transcribe .wav with selected language
    3. Parse result to SubtitleSegment[] with start/end timestamps
    4. Generate SRT file
  - Progress steps: "Extracting audio..." → "Transcribing..." → "Generating subtitles..."
  - First use: download tiny whisper model (~75MB) with progress bar
- Editable subtitle list: timestamp (tappable → seek video), text field, delete
- Style presets (horizontal scroll):
  1. Classic White — white text, black outline, bottom center
  2. Netflix Bold — bold white, semi-transparent black pill bg
  3. TikTok Viral — yellow text, black stroke, animated pop-in
  4. Neon Glow — cyan text with glow
  5. Minimal Clean — small gray text, no bg
  6. Word Highlight — karaoke style, word-by-word highlight
- Font picker, color picker, size slider (14–48pt), position (Top/Middle/Bottom), animation (None/Pop/Slide/Fade)

AUDIO TAB:
- Original audio volume slider (0–150%)
- "Add Background Music" → 5-6 built-in royalty-free tracks + "Import from Files"
- Music volume slider
- Fade in / Fade out toggles

ADJUST TAB:
- Aspect ratio: 9:16 (default), 1:1, 4:5, 16:9 (visual preview cards)
- Speed: 0.5x / 0.75x / 1x / 1.25x / 1.5x / 2x (pill selector)
- Trim: start/end time pickers (mm:ss.ms)

e) Timeline (bottom):
- Scrollable horizontal waveform
- Blue playhead
- Red markers for silence regions
- Tap to seek, pinch to zoom

### 5. EXPORT FLOW
- "Export" button → bottom sheet
- Platform presets: TikTok (1080x1920 H.264 30fps), Instagram Reels, YouTube Shorts (60fps), Custom
- Quality: 720p / 1080p / 4K (4K = premium, show lock icon)
- "Export Video" button → ffmpeg pipeline:
  1. Apply silence cuts (if enabled)
  2. Burn subtitles as SRT (if enabled)
  3. Mix audio tracks
  4. Scale to target resolution
  5. Encode H.264
- Progress screen: animated bar, current step label, cancel button
- On complete: "Save to Camera Roll" + "Share" buttons
- Free plan: add "BlitzCut" watermark (bottom-right, semi-transparent)
- Premium: no watermark

### 6. PAYWALL (app/paywall.tsx) — UI ONLY, NO PAYMENT SDK
- Full screen dark modal
- "Go Premium" gradient title with sparkle icon
- Feature checklist:
  ✓ Unlimited silence removal
  ✓ All subtitle styles & fonts
  ✓ No watermark
  ✓ Full music library
  ✓ All export quality options
- Two plan cards side-by-side:
  - Monthly: $6.99/month
  - Yearly: $29.99/year (BEST VALUE badge, highlighted purple border)
  - 3-day free trial badge on yearly
- "Continue" CTA (full width, purple gradient)
- "Restore Purchases" text link
- Privacy Policy & Terms links
- X dismiss button top-right
- isPremium state managed in subscriptionStore (Zustand) — toggled manually for now

### 7. SETTINGS (app/(tabs)/settings.tsx)
- Avatar circle, "BlitzCut User", plan badge (Free/Premium)
- Current plan + "Upgrade to Premium" button (if free)
- Default export quality selector
- Default aspect ratio selector
- Auto-download Whisper model toggle
- Haptic feedback toggle
- Used storage progress bar + "Clear cache" button
- App version, Rate the App, Privacy Policy, Terms, Contact Support

---

## CORE SERVICES

### src/services/ffmpegService.ts
```typescript
import { FFmpegKit, FFmpegKitConfig, ReturnCode } from 'ffmpeg-kit-react-native';

// Extract audio for Whisper transcription
async function extractAudio(videoPath: string): Promise<string>
// Command: ffmpeg -i {videoPath} -vn -acodec pcm_s16le -ar 16000 -ac 1 {outputWav}

// Detect silences — parse STDERR for silence_start / silence_end
async function detectSilences(audioPath: string, threshold: number, duration: number): Promise<SilenceSegment[]>
// Command: ffmpeg -i {audioPath} -af "silencedetect=n={threshold}dB:d={duration}" -f null -
// IMPORTANT: parse FFmpegKitConfig logs (stderr), not stdout

// Remove silences using concat demuxer
async function removeSilences(videoPath: string, keepSegments: TimeSegment[], padding: number): Promise<string>
// Write concat list file with absolute paths, then:
// ffmpeg -f concat -safe 0 -i {listFile} -c copy {output}

// Burn-in subtitles
async function burnSubtitles(videoPath: string, srtPath: string, style: SubtitleStyle): Promise<string>
// ffmpeg -i {video} -vf "subtitles={srtPath}:force_style='{styleString}'" {output}

// Full export pipeline
async function exportVideo(config: ExportConfig): Promise<string>
// scale + encode + watermark if free:
// ffmpeg -i {input} -vf "scale={w}:{h},drawtext=..." -c:v libx264 -preset fast -crf 23 {output}
```

### src/services/transcriptionService.ts
```typescript
import { initWhisper } from 'whisper.rn';

// 1. Check model at FileSystem.documentDirectory + 'models/ggml-tiny.bin'
// 2. If missing, download with expo-file-system downloadAsync + progress callback
// 3. Initialize: const ctx = await initWhisper({ filePath: modelPath })
// 4. Transcribe: const { result } = await ctx.transcribe(audioPath, { language })
// 5. Parse segments to SubtitleSegment[] with start/end ms timestamps
// 6. Generate SRT string and write to cacheDirectory
```

### src/services/silenceService.ts
```typescript
// Parse ffmpeg stderr output for silencedetect filter:
// Lines: "silence_start: 2.341" and "silence_end: 4.523 | silence_duration: 2.182"
// Return SilenceSegment[] and compute keepSegments (inverse)
// Generate ffmpeg concat list file content (with absolute file:// paths)
```

---

## DATA TYPES (src/types/index.ts)
```typescript
interface Project {
  id: string; name: string; originalVideoPath: string;
  processedVideoPath?: string; thumbnailPath?: string;
  duration: number; createdAt: Date; updatedAt: Date;
  status: 'draft' | 'processing' | 'exported';
}
interface SilenceSegment { start: number; end: number; duration: number; excluded: boolean; }
interface SubtitleSegment { id: string; start: number; end: number; text: string; }
interface SubtitleStyle {
  preset: 'classic' | 'netflix' | 'tiktok' | 'neon' | 'minimal' | 'karaoke';
  fontFamily: string; fontSize: number; textColor: string;
  backgroundColor: string; backgroundOpacity: number;
  position: 'top' | 'middle' | 'bottom';
  animation: 'none' | 'pop' | 'slideUp' | 'fade';
  bold: boolean; outline: boolean; outlineColor: string;
}
interface ExportConfig {
  videoPath: string; platform: 'tiktok' | 'reels' | 'shorts' | 'custom';
  resolution: '720p' | '1080p' | '4k'; fps: 30 | 60;
  includeSubtitles: boolean; srtPath?: string; subtitleStyle?: SubtitleStyle;
  watermark: boolean; audioVolume: number; musicPath?: string; musicVolume?: number;
}
interface TimeSegment { start: number; end: number; }
```

---

## STATE (Zustand)

### projectStore — persist to AsyncStorage
- projects: Project[], addProject, updateProject, deleteProject, currentProjectId

### editorStore
- currentProject, silenceSegments, subtitleSegments, subtitleStyle
- isProcessing, processingProgress (0–1), processingStep (string)
- playbackPosition, isPlaying
- silenceSettings: { threshold: number, minDuration: number, padding: number }
- exportConfig: Partial<ExportConfig>

### subscriptionStore
- isPremium: boolean (default false, toggle manually for testing)
- plan: 'free' | 'monthly' | 'yearly'

Free plan limits:
- Max 3 projects
- Max 60s export
- Watermark on all exports
- Only "Classic White" subtitle style
- Silence removal: first 30s only
- No background music

Premium unlocks everything. Show lock icon (🔒) on gated features. Tap locked → navigate to paywall.

---

## ANIMATIONS
- react-native-reanimated v3 for all animations
- Button press: scale(0.97) spring
- Subtitle pop animation: spring withSpring
- Tab content panel: slide transition
- Silence results: staggered FadeIn per segment
- Processing overlay: animated gradient-like pulsing
- Timeline scrubber: haptic feedback via expo-haptics

---

## FILE STORAGE
- Projects: FileSystem.documentDirectory + 'projects/'
- Thumbnails: FileSystem.documentDirectory + 'thumbnails/'
- Whisper models: FileSystem.documentDirectory + 'models/'
- Temp: FileSystem.cacheDirectory + 'temp/'
- Generate thumbnails with ffmpeg: ffmpeg -i video.mp4 -vframes 1 -q:v 2 thumb.jpg

---

## PERMISSIONS

iOS Info.plist:
- NSPhotoLibraryUsageDescription: "To import and save videos"
- NSMicrophoneUsageDescription: "To record video"
- NSCameraUsageDescription: "To record video"

Android AndroidManifest.xml:
- READ_MEDIA_VIDEO, WRITE_EXTERNAL_STORAGE, READ_EXTERNAL_STORAGE, CAMERA, RECORD_AUDIO

---

## CRITICAL NOTES
1. ffmpeg-kit-react-native requires bare workflow (npx expo prebuild) — NOT Expo Go
2. whisper.rn is a React Native native module — also requires bare workflow
3. Parse ffmpeg STDERR (not stdout) for silencedetect output
4. Concat list file must use absolute file:// paths
5. All FFmpeg calls are async — show progress/loading states
6. whisper.rn tiny model download URL: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
7. SRT format: sequence number, "00:00:01,000 --> 00:00:03,500", text, blank line
8. Test on physical device (simulator has limited video support)
9. NO RevenueCat or any payment SDK — paywall is UI-only, isPremium toggled in Zustand
10. Initialize expo-router in app/_layout.tsx, set up all permission requests on first launch

Build all screens fully. Make it production-ready with pixel-perfect dark UI.