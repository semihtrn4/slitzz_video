# Design Document

## native-integrations-editor

---

## Overview

Bu tasarım, BlitzCut uygulamasının mock servislerini gerçek native implementasyonlarla değiştirmeyi ve eksik UI bileşenlerini eklemeyi kapsar. Temel hedefler:

- `ffmpeg-kit-react-native` ile gerçek FFmpeg komutları çalıştırma
- `whisper.rn` ile cihaz üzerinde offline transkripsiyon
- `expo-media-library` ve `expo-sharing` ile export sonrası paylaşım
- Timeline pinch-to-zoom, video trim, zaman overlay
- `expo-av` ile arka plan müzik önizleme
- `SubtitleStylePicker`, `BottomSheet`, `Toast` UI bileşenleri
- Karaoke/word-highlight altyazı (`@shopify/react-native-skia`)
- Lottie empty state animasyonu
- Settings ekranı eksiklikleri (model durumu, versiyon, değerlendirme)
- Haptic feedback entegrasyonu
- iOS/Android izin manifest'leri
- Free/Premium plan sınırlarının tutarlı uygulanması

Mevcut mimari (Zustand store'lar, Expo Router, expo-video tabanlı VideoPlayer) korunur; yalnızca servis katmanı ve UI bileşenleri genişletilir.

---

## Architecture

```mermaid
graph TD
    subgraph UI Layer
        A[app/editor/[id].tsx] --> B[VideoPlayer]
        A --> C[Timeline]
        A --> D[ToolBar]
        A --> E[SubtitleStylePicker]
        A --> F[BottomSheet]
        A --> G[Toast]
        H[app/(tabs)/index.tsx] --> I[LottieEmptyState]
        J[app/(tabs)/settings.tsx] --> K[WhisperModelSection]
    end

    subgraph Hook Layer
        L[useVideoEditor] --> M[ffmpegService]
        L --> N[transcriptionService]
        L --> O[silenceService]
        P[useAudioPlayer] --> Q[expo-av Audio]
        R[useHaptics] --> S[expo-haptics]
        T[useToast] --> G
    end

    subgraph Service Layer
        M[ffmpegService\nffmpeg-kit-react-native]
        N[transcriptionService\nwhisper.rn]
        O[silenceService\nparse + compute]
        U[mediaService\nexpo-media-library\nexpo-sharing]
    end

    subgraph Store Layer
        V[editorStore\nZustand]
        W[projectStore\nZustand + persist]
        X[subscriptionStore\nZustand + persist]
        Y[settingsStore\nZustand + persist]
    end

    A --> L
    A --> P
    A --> R
    B --> V
    C --> V
    L --> V
    L --> W
    L --> X
```

### Katman Sorumlulukları

- **Service Layer**: Native API çağrıları, dosya I/O, FFmpeg/Whisper komutları. UI'dan bağımsız, test edilebilir.
- **Hook Layer**: Servis çağrılarını orchestrate eder, store güncellemelerini tetikler, hata yönetimi yapar.
- **Store Layer**: Uygulama durumu. `editorStore` oturum bazlı (persist yok), `projectStore` ve `subscriptionStore` AsyncStorage'a persist edilir. Yeni `settingsStore` haptic toggle ve diğer kullanıcı tercihlerini saklar.
- **UI Layer**: Store'dan okur, hook'ları çağırır. İş mantığı içermez.

---

## Components and Interfaces

### FFmpegService (güncelleme)

```typescript
interface FFmpegService {
  extractAudio(videoPath: string): Promise<string>
  detectSilences(audioPath: string, threshold: number, minDuration: number): Promise<SilenceSegment[]>
  removeSilences(videoPath: string, keepSegments: TimeSegment[], padding: number): Promise<string>
  exportVideo(config: ExportConfig, onProgress?: (progress: number, step: string) => void): Promise<string>
  generateThumbnail(videoPath: string, time?: number): Promise<string>
  getVideoInfo(videoPath: string): Promise<VideoInfo>
}
```

Gerçek implementasyon `FFmpegKit.executeAsync()` kullanır. Sessizlik algılama için `FFmpegKitConfig.enableLogCallback()` ile stderr log'ları dinlenir.

### TranscriptionService (güncelleme)

```typescript
interface TranscriptionService {
  isModelDownloaded(): Promise<boolean>
  downloadModel(onProgress?: (progress: number) => void): Promise<string>
  transcribe(audioPath: string, language: LanguageCode, onProgress?: (step: string) => void): Promise<SubtitleSegment[]>
  generateSRT(segments: SubtitleSegment[]): Promise<string>
}
```

`whisper.rn`'nin `initWhisper` ve `ctx.transcribe` API'leri kullanılır. Model indirme `FileSystem.downloadAsync()` ile yapılır.

### MediaService (yeni)

```typescript
interface MediaService {
  saveToLibrary(videoPath: string): Promise<void>
  share(videoPath: string): Promise<void>
  requestPermissions(): Promise<boolean>
}
```

### useAudioPlayer (yeni hook)

```typescript
interface UseAudioPlayerReturn {
  loadTrack(path: string): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  stop(): Promise<void>
  setVolume(volume: number): Promise<void>
  unload(): Promise<void>
  isPlaying: boolean
}
```

`expo-av` `Audio.Sound` API'si kullanılır.

### useHaptics (yeni hook)

```typescript
interface UseHapticsReturn {
  selection(): void
  impact(style: ImpactFeedbackStyle): void
  notification(type: NotificationFeedbackType): void
}
```

`settingsStore.hapticEnabled` false ise tüm çağrılar no-op olur.

### useToast (yeni hook)

```typescript
type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface UseToastReturn {
  show(message: string, type: ToastType, duration?: number): void
  hide(id: string): void
  toasts: Toast[]
}
```

### BottomSheet (yeni bileşen)

```typescript
interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
  snapPoints?: number[]  // yüzde cinsinden, örn. [50, 90]
}
```

`PanGestureHandler` + `react-native-reanimated` `useAnimatedGestureHandler` ile sürükleme. Backdrop `TouchableWithoutFeedback` ile kapatma.

### SubtitleStylePicker (yeni bileşen)

```typescript
interface SubtitleStylePickerProps {
  style: SubtitleStyle
  onChange: (style: Partial<SubtitleStyle>) => void
  isPremium: boolean
  onUpgrade: () => void
}
```

Yatay kaydırılabilir preset listesi + font boyutu slider + renk seçici + pozisyon/animasyon toggle'ları.

### Toast (yeni bileşen)

```typescript
interface ToastProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}
```

`react-native-reanimated` `SlideInUp` / `SlideOutUp` animasyonları. Kuyruk yönetimi `useToast` hook'unda.

### Timeline (güncelleme)

Mevcut `Timeline` bileşenine `PinchGestureHandler` eklenir. `pixelsPerSecond` state'i `useSharedValue` ile Reanimated'a taşınır.

### VideoPlayer (güncelleme)

- Sol alt köşeye `{currentTime} / {totalDuration}` overlay eklenir.
- Export sonrası "Kamera Rulosuna Kaydet" ve "Paylaş" butonları gösterilir.
- Trim aralığı (`trimStart`, `trimEnd`) oynatmayı sınırlar.

### settingsStore (yeni store)

```typescript
interface SettingsState {
  hapticEnabled: boolean
  autoDownloadModel: boolean
  defaultResolution: Resolution
  defaultAspectRatio: AspectRatio
  setHapticEnabled(v: boolean): void
  setAutoDownloadModel(v: boolean): void
  setDefaultResolution(v: Resolution): void
  setDefaultAspectRatio(v: AspectRatio): void
}
```

AsyncStorage'a persist edilir.

---

## Data Models

Mevcut tipler korunur. Aşağıdaki eklemeler yapılır:

```typescript
// src/types/index.ts eklemeleri

export interface VideoInfo {
  duration: number
  width: number
  height: number
  fps: number
}

export interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration: number
}

// SubtitleSegment'e kelime bazlı karaoke desteği için
export interface WordTimestamp {
  word: string
  start: number
  end: number
}

// SubtitleSegment genişletmesi
export interface SubtitleSegment {
  id: string
  start: number
  end: number
  text: string
  words?: WordTimestamp[]  // karaoke modu için
}
```

### Dosya Sistemi Yapısı

```
FileSystem.cacheDirectory/
  temp/
    audio_{timestamp}.wav       ← extractAudio çıktısı
    cut_{timestamp}.mp4         ← removeSilences çıktısı
    subtitled_{timestamp}.mp4   ← burnSubtitles çıktısı
    subtitles_{timestamp}.srt   ← generateSRT çıktısı
    concat_{timestamp}.txt      ← FFmpeg concat listesi
  thumbs/
    thumb_{timestamp}.jpg       ← generateThumbnail çıktısı

FileSystem.documentDirectory/
  models/
    ggml-tiny.bin               ← Whisper modeli (~75MB)
  exports/
    export_{timestamp}.mp4      ← exportVideo çıktısı
```

### app.json İzin Yapılandırması

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSPhotoLibraryUsageDescription": "Videolarınızı kamera rulosuna kaydetmek için",
        "NSMicrophoneUsageDescription": "Video kaydı için mikrofon erişimi",
        "NSCameraUsageDescription": "Video çekimi için kamera erişimi"
      }
    },
    "android": {
      "permissions": [
        "READ_MEDIA_VIDEO",
        "WRITE_EXTERNAL_STORAGE",
        "READ_EXTERNAL_STORAGE",
        "CAMERA",
        "RECORD_AUDIO"
      ]
    }
  }
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: SRT Round-Trip

*For any* geçerli `SubtitleSegment[]` dizisi, `generateSRT` ile SRT dosyası oluşturup ardından bu dosyayı parse etmek, orijinal segment içeriğiyle (id hariç, start/end/text) eşdeğer bir dizi üretmelidir. Bu bir serialization round-trip özelliğidir: `parseSRT(generateSRT(segments))` ≡ `segments`.

**Validates: Requirements 6.5**

---

### Property 2: Sessizlik Segment Invariantları

*For any* FFmpeg stderr çıktısı, `parseSilenceOutput` tarafından döndürülen her `SilenceSegment` için şu koşullar sağlanmalıdır: `segment.start >= 0`, `segment.end > segment.start`, `segment.duration ≈ segment.end - segment.start` ve `segment.excluded === false`. Boş veya sessizlik içermeyen stderr için boş dizi döndürülmelidir.

**Validates: Requirements 2.3, 2.4, 2.5**

---

### Property 3: Keep Segments Invariantları

*For any* video süresi, sessizlik segmentleri listesi ve padding değeri, `computeKeepSegments` çıktısı şu iki koşulu aynı anda sağlamalıdır: (a) segmentlerin toplam süresi orijinal video süresini aşmamalıdır; (b) segmentler sıralı (`segments[i].end <= segments[i+1].start`) ve örtüşmez olmalıdır.

**Validates: Requirements 3.1, 3.2**

---

### Property 4: Free Plan Export Süresi Sınırı

*For any* video süresi ve Free Plan aktifken, `canExportDuration(duration)` yalnızca `duration <= 60` olduğunda `true` döndürmelidir. Tam sınırda (`duration === 60`) `true`, sınırı aşınca (`duration === 61`) `false` döndürmelidir.

**Validates: Requirements 4.5, 20.2**

---

### Property 5: Free Plan Proje Sayısı Sınırı

*For any* mevcut proje sayısı ve Free Plan aktifken, `canCreateProject(count)` yalnızca `count < 3` olduğunda `true` döndürmelidir. `count === 3` için `false` döndürmelidir.

**Validates: Requirements 20.1**

---

### Property 6: Free Plan Sessizlik Kaldırma Sınırı

*For any* video süresi ve Free Plan aktifken, `canRemoveSilence(duration)` yalnızca `duration <= 30` olduğunda `true` döndürmelidir.

**Validates: Requirements 3.4, 20.5**

---

### Property 7: Free Plan Watermark Invariantı

*For any* Free Plan aktif durumda, `hasWatermark()` her zaman `true` döndürmelidir. Premium Plan aktifken her zaman `false` döndürmelidir.

**Validates: Requirements 20.3**

---

### Property 8: Subtitle Style Preset Kilidi

*For any* altyazı preset ID'si ve Free Plan aktifken, `canUseSubtitleStyle(presetId)` yalnızca `presetId === 'classic'` için `true` döndürmelidir; diğer tüm preset ID'leri için `false` döndürmelidir.

**Validates: Requirements 12.3, 20.4**

---

### Property 9: Haptic Kapalıyken Çağrı Yapılmaz

*For any* haptic tetikleyici eylem (timeline dokunuşu, export başlangıcı/bitişi, sessizlik algılama), `hapticEnabled === false` iken `Haptics.*` fonksiyonlarından hiçbiri çağrılmamalıdır. `useHaptics` hook'u tüm çağrıları no-op olarak işlemelidir.

**Validates: Requirements 18.5**

---

### Property 10: Trim Aralığı Geçerliliği

*For any* `trimStart` ve `trimEnd` değerleri, `trimStart >= trimEnd` olduğunda sistem geçersiz trim hatası göstermeli ve export işlemi başlatılmamalıdır. Yalnızca `trimStart < trimEnd` koşulunu sağlayan değer çiftleri geçerli kabul edilmelidir.

**Validates: Requirements 9.5**

---

### Property 11: Toast Otomatik Kapanma

*For any* gösterilen Toast bildirimi, belirtilen `duration` ms (varsayılan 3000ms) geçtikten sonra toast listesinden kaldırılmış olmalıdır. Birden fazla toast aynı anda gösterildiğinde her biri kendi süresine göre bağımsız olarak kapanmalıdır.

**Validates: Requirements 15.3, 15.5**

---

### Property 12: Toast Tip Desteği

*For any* `ToastType` değeri (`success`, `error`, `warning`, `info`), `show(message, type)` çağrısı toast listesine doğru tipte bir öğe eklemelidir. Döndürülen toast nesnesinin `type` alanı, çağrıda belirtilen tip ile eşleşmelidir.

**Validates: Requirements 15.2**

---

### Property 13: Zoom Hesaplama Invariantları

*For any* pinch gesture scale değeri, `pixelsPerSecond` değeri her zaman `[5, 50]` aralığında kalmalıdır. Playhead piksel pozisyonu her zaman `playbackPosition * pixelsPerSecond` formülüyle hesaplanmalıdır; zoom değiştiğinde bu ilişki korunmalıdır.

**Validates: Requirements 8.2, 8.4**

---

### Property 14: Model İndirme Progress Monotonluğu

*For any* model indirme işlemi, `onProgress` callback'ine iletilen değerler monoton artan olmalıdır (her çağrıda önceki değerden büyük veya eşit) ve `[0, 1]` aralığında kalmalıdır. Son çağrı `1.0` değerini iletmelidir.

**Validates: Requirements 5.3**

---

### Property 15: Karaoke Render Invariantları

*For any* `SubtitleSegment` ve `preset === 'karaoke'`, `SubtitlePreview` bileşeni segment metnindeki kelime sayısı kadar ayrı `Text` bileşeni render etmelidir. `playbackPosition` bir kelimenin `[start, end]` aralığına denk geldiğinde, o kelime vurgulanmış stil ile render edilmelidir.

**Validates: Requirements 13.1, 13.2**

---

## Error Handling

### FFmpeg Hataları

- `FFmpegKit.executeAsync()` sonucunda `ReturnCode.isSuccess(rc)` false ise `Error` fırlatılır.
- Hata mesajı FFmpeg log'larından alınır (`FFmpegKitConfig.getLastCommandOutput()`).
- `useVideoEditor` hook'u hataları yakalar, `Toast.error()` ile kullanıcıya gösterir.

### Whisper Model İndirme Hataları

- `FileSystem.downloadAsync()` başarısız olursa `TranscriptionService` hata fırlatır.
- `SettingsScreen`'de "Yeniden Dene" butonu gösterilir.
- Kısmi indirme durumunda bozuk dosya silinir.

### İzin Hataları

- `MediaLibrary.requestPermissionsAsync()` reddedilirse `Alert` ile ayarlara yönlendirme sunulur.
- İzin durumu her kullanım öncesi kontrol edilir, önbelleğe alınmaz.

### Trim Geçersizliği

- `trimStart >= trimEnd` durumunda export butonu devre dışı bırakılır ve inline hata mesajı gösterilir.

### Free Plan Sınır Aşımı

- Tüm gated özellikler `subscriptionStore` metodları üzerinden kontrol edilir.
- Sınır aşımında `/paywall` rotasına yönlendirilir, işlem iptal edilir.

### Ses Yükleme Hataları

- `Audio.Sound.createAsync()` başarısız olursa `useAudioPlayer` hook'u `Toast.error()` gösterir ve `musicPath` state'i temizlenir.

---

## Testing Strategy

### Dual Testing Approach

Her özellik hem unit testler hem de property-based testlerle doğrulanır:

- **Unit testler**: Belirli örnekler, edge case'ler ve hata koşulları
- **Property testler**: Tüm geçerli girdiler için evrensel özellikler

### Property-Based Testing

Kütüphane: **fast-check** (TypeScript/JavaScript için en yaygın PBT kütüphanesi)

```bash
npm install --save-dev fast-check
```

Her property testi minimum **100 iterasyon** çalıştırır. Her test, tasarım dokümanındaki property'ye referans verir:

```typescript
// Tag format: Feature: native-integrations-editor, Property {N}: {property_text}
```

#### Property Test Örnekleri

```typescript
// Property 1: SRT Round-Trip
// Feature: native-integrations-editor, Property 1: SRT round-trip
it('SRT round-trip preserves segment content', () => {
  fc.assert(
    fc.asyncProperty(
      fc.array(subtitleSegmentArbitrary(), { minLength: 1, maxLength: 20 }),
      async (segments) => {
        const srtPath = await transcriptionService.generateSRT(segments);
        const parsed = parseSRT(await FileSystem.readAsStringAsync(srtPath));
        expect(parsed.length).toBe(segments.length);
        parsed.forEach((seg, i) => {
          expect(seg.text).toBe(segments[i].text);
          expect(Math.abs(seg.start - segments[i].start)).toBeLessThan(0.001);
          expect(Math.abs(seg.end - segments[i].end)).toBeLessThan(0.001);
        });
      }
    ),
    { numRuns: 100 }
  );
});

// Property 2: Sessizlik Segment Invariantları
// Feature: native-integrations-editor, Property 2: silence segment invariants
it('parsed silence segments have valid ranges and structure', () => {
  fc.assert(
    fc.property(
      ffmpegSilenceStderrArbitrary(),
      (stderr) => {
        const segments = silenceService.parseSilenceOutput(stderr);
        return segments.every(
          (s) => s.start >= 0 && s.end > s.start &&
                 Math.abs(s.duration - (s.end - s.start)) < 0.001 &&
                 s.excluded === false
        );
      }
    ),
    { numRuns: 100 }
  );
});

// Property 3: Keep Segments Invariantları
// Feature: native-integrations-editor, Property 3: keep segments invariants
it('computeKeepSegments produces sorted non-overlapping segments within duration', () => {
  fc.assert(
    fc.property(
      fc.float({ min: 1, max: 3600 }),
      fc.array(silenceSegmentArbitrary(), { maxLength: 50 }),
      fc.integer({ min: 0, max: 500 }),
      (duration, silences, padding) => {
        const keeps = silenceService.computeKeepSegments(duration, silences, padding);
        const totalDuration = keeps.reduce((sum, s) => sum + (s.end - s.start), 0);
        const isSorted = keeps.every((s, i) => i === 0 || keeps[i - 1].end <= s.start);
        return totalDuration <= duration + 0.001 && isSorted;
      }
    ),
    { numRuns: 100 }
  );
});

// Property 4: Free Plan Export Süresi Sınırı
// Feature: native-integrations-editor, Property 4: free plan export duration limit
it('canExportDuration returns true only for duration <= 60 on free plan', () => {
  fc.assert(
    fc.property(
      fc.float({ min: 0, max: 3600 }),
      (duration) => {
        const store = createFreePlanStore();
        return store.canExportDuration(duration) === (duration <= 60);
      }
    ),
    { numRuns: 100 }
  );
});

// Property 9: Haptic Kapalıyken Çağrı Yapılmaz
// Feature: native-integrations-editor, Property 9: no haptic calls when disabled
it('useHaptics makes no calls when hapticEnabled is false', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('selection', 'impact', 'notification'),
      (hapticType) => {
        const mockHaptics = jest.fn();
        const { result } = renderHook(() => useHaptics(), {
          wrapper: createSettingsWrapper({ hapticEnabled: false }),
        });
        result.current[hapticType]();
        expect(mockHaptics).not.toHaveBeenCalled();
      }
    ),
    { numRuns: 100 }
  );
});
```

### Unit Test Odak Alanları

- `FFmpegService.extractAudio`: Başarılı komut → geçerli `.wav` yolu döner
- `FFmpegService.detectSilences`: Boş stderr → boş dizi döner (edge case)
- `TranscriptionService.isModelDownloaded`: Model dosyası yokken `false` döner
- `MediaService.saveToLibrary`: İzin reddedildiğinde hata fırlatır
- `subscriptionStore.canExportDuration`: 60s sınırı tam sınırda (edge case: `duration === 60` → `true`, `duration === 61` → `false`)
- `BottomSheet`: Backdrop tıklamasında `onClose` çağrılır
- `Toast`: 3 saniye sonra otomatik kapanır
- `useHaptics`: `hapticEnabled === false` iken `Haptics.selectionAsync` çağrılmaz

### Test Dosya Yapısı

```
__tests__/
  services/
    ffmpegService.test.ts
    transcriptionService.test.ts
    silenceService.test.ts
    mediaService.test.ts
  stores/
    subscriptionStore.test.ts
    settingsStore.test.ts
  hooks/
    useAudioPlayer.test.ts
    useHaptics.test.ts
    useToast.test.ts
  components/
    BottomSheet.test.tsx
    Toast.test.tsx
    SubtitleStylePicker.test.tsx
    SubtitlePreview.test.tsx
    Timeline.test.tsx
  properties/
    p01_srtRoundTrip.property.test.ts          // Property 1
    p02_silenceSegments.property.test.ts       // Property 2
    p03_keepSegments.property.test.ts          // Property 3
    p04_exportDurationLimit.property.test.ts   // Property 4
    p05_projectCountLimit.property.test.ts     // Property 5
    p06_silenceRemovalLimit.property.test.ts   // Property 6
    p07_watermarkInvariant.property.test.ts    // Property 7
    p08_subtitleStyleLock.property.test.ts     // Property 8
    p09_hapticGating.property.test.ts          // Property 9
    p10_trimValidation.property.test.ts        // Property 10
    p11_toastAutoClose.property.test.ts        // Property 11
    p12_toastTypeSupport.property.test.ts      // Property 12
    p13_zoomCalculation.property.test.ts       // Property 13
    p14_progressMonotonicity.property.test.ts  // Property 14
    p15_karaokeRender.property.test.ts         // Property 15
```
