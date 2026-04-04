# Implementation Plan: Native Integrations & Editor Enhancements

## Overview

Mock servisler gerçek native implementasyonlarla değiştirilir, eksik UI bileşenleri eklenir ve free/premium plan sınırları tutarlı biçimde uygulanır. Görevler servis katmanından başlayıp UI katmanına doğru ilerler; her adım bir öncekinin üzerine inşa edilir.

## Tasks

- [x] 1. Tip tanımlarını ve `settingsStore`'u oluştur
  - `src/types/index.ts` dosyasına `VideoInfo`, `ToastItem`, `WordTimestamp` tiplerini ekle; `SubtitleSegment`'e `words?: WordTimestamp[]` alanını ekle
  - `src/stores/settingsStore.ts` dosyasını oluştur: `hapticEnabled`, `autoDownloadModel`, `defaultResolution`, `defaultAspectRatio` alanlarıyla Zustand + AsyncStorage persist
  - _Requirements: 17.5, 18.5_

- [x] 2. `FFmpegService`'i gerçek `ffmpeg-kit-react-native` implementasyonuyla güncelle
  - [x] 2.1 `extractAudio` metodunu gerçek FFmpeg komutuyla uygula
    - `FFmpegKit.executeAsync()` ile `ffmpeg -i {videoPath} -vn -acodec pcm_s16le -ar 16000 -ac 1 {outputWav}` çalıştır
    - `ReturnCode.isSuccess(rc)` ile başarı kontrolü yap; başarısız olursa `Error` fırlat
    - Çıktıyı `FileSystem.cacheDirectory + 'temp/'` dizinine yaz
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 2.2 `detectSilences` metodunu gerçek FFmpeg log callback'iyle uygula
    - `FFmpegKitConfig.enableLogCallback()` ile stderr log'larını dinle
    - `ffmpeg -i {audioPath} -af "silencedetect=n={threshold}dB:d={minDuration}" -f null -` komutunu çalıştır
    - Log callback'ten toplanan stderr'i `silenceService.parseSilenceOutput()` ile parse et
    - _Requirements: 2.1, 2.2_

  - [ ]* 2.3 Property testi: Sessizlik segment invariantları
    - **Property 2: Sessizlik Segment Invariantları**
    - **Validates: Requirements 2.3, 2.4, 2.5**

  - [x] 2.4 `removeSilences` metodunu concat demuxer ile uygula
    - `silenceService.generateConcatList()` ile concat liste dosyasını `cacheDirectory/temp/` altına yaz
    - `ffmpeg -f concat -safe 0 -i {listFile} -c copy {output}` komutunu çalıştır
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 2.5 Property testi: Keep segments invariantları
    - **Property 3: Keep Segments Invariantları**
    - **Validates: Requirements 3.1, 3.2**

  - [x] 2.6 `exportVideo` metodunu H.264 encode, scale ve watermark filtreleriyle uygula
    - `-c:v libx264 -preset fast -crf 23` parametrelerini kullan
    - `-vf "scale={width}:{height}"` ile hedef çözünürlüğe ölçekle
    - `config.watermark === true` ise `drawtext` filtresi ekle
    - `onProgress(progress, step)` callback'ini her adımda çağır
    - Free plan + süre > 60s ise export'u reddet ve paywall'a yönlendir
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 2.7 Property testi: Free plan export süresi sınırı
    - **Property 4: Free Plan Export Süresi Sınırı**
    - **Validates: Requirements 4.5, 20.2**

  - [x] 2.8 `getVideoInfo` ve `generateThumbnail` metodlarını gerçek FFmpeg ile uygula
    - `ffprobe` çıktısını parse ederek `VideoInfo` döndür
    - `ffmpeg -i {videoPath} -vframes 1 -q:v 2 {outputThumb}` ile thumbnail oluştur
    - _Requirements: 1.1_

- [x] 3. Checkpoint — Tüm testler geçmeli, sorularınız varsa sorun

- [x] 4. `TranscriptionService`'i gerçek `whisper.rn` implementasyonuyla güncelle
  - [x] 4.1 `isModelDownloaded` ve `downloadModel` metodlarını gerçek dosya sistemiyle uygula
    - `FileSystem.documentDirectory + 'models/ggml-tiny.bin'` yolunu kontrol et
    - `FileSystem.downloadAsync()` ile indirme yap; `onProgress(downloadedBytes / totalBytes)` callback'ini çağır
    - İndirme tamamlandığında dosya varlığını doğrula; başarısız olursa bozuk dosyayı sil ve `Error` fırlat
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 4.2 Property testi: Model indirme progress monotonluğu
    - **Property 14: Model İndirme Progress Monotonluğu**
    - **Validates: Requirements 5.3**

  - [x] 4.3 `transcribe` metodunu gerçek `whisper.rn` API'siyle uygula
    - `initWhisper({ filePath: modelPath })` ile context başlat
    - `ctx.transcribe(audioPath, { language })` çağrısıyla transkripsiyon yap
    - Sonucu `SubtitleSegment[]` formatına parse et; `words` alanını karaoke için doldur
    - _Requirements: 6.1, 6.2, 6.3, 6.6_

  - [x] 4.4 `generateSRT` metodunu uygula ve SRT round-trip özelliğini sağla
    - SRT formatında dosya oluştur ve `cacheDirectory/temp/` altına yaz
    - `parseSRT` yardımcı fonksiyonunu `__tests__/` altına ekle (round-trip testi için)
    - _Requirements: 6.4, 6.5_

  - [ ]* 4.5 Property testi: SRT round-trip
    - **Property 1: SRT Round-Trip**
    - **Validates: Requirements 6.5**

- [x] 5. `MediaService`'i oluştur
  - `src/services/mediaService.ts` dosyasını oluştur
  - `saveToLibrary(videoPath)`: `MediaLibrary.requestPermissionsAsync()` → `MediaLibrary.saveToLibraryAsync()`
  - `share(videoPath)`: `Sharing.shareAsync(videoPath)`
  - `requestPermissions()`: izin durumunu döndür; reddedilirse `Alert` ile ayarlara yönlendir
  - _Requirements: 7.2, 7.3, 7.4, 7.5_

- [x] 6. `useHaptics` hook'unu oluştur
  - `src/hooks/useHaptics.ts` dosyasını oluştur
  - `settingsStore.hapticEnabled` false ise tüm çağrılar no-op olur
  - `selection()`, `impact(style)`, `notification(type)` metodlarını uygula
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [ ]* 6.1 Property testi: Haptic kapalıyken çağrı yapılmaz
    - **Property 9: Haptic Kapalıyken Çağrı Yapılmaz**
    - **Validates: Requirements 18.5**

- [x] 7. `useToast` hook'unu ve `Toast` bileşenini oluştur
  - [x] 7.1 `src/hooks/useToast.ts` dosyasını oluştur
    - `show(message, type, duration?)`, `hide(id)`, `toasts` state'ini uygula
    - Her toast kendi `duration` (varsayılan 3000ms) süresine göre bağımsız kapanır
    - _Requirements: 15.1, 15.2, 15.3, 15.5_

  - [ ]* 7.2 Property testi: Toast otomatik kapanma
    - **Property 11: Toast Otomatik Kapanma**
    - **Validates: Requirements 15.3, 15.5**

  - [ ]* 7.3 Property testi: Toast tip desteği
    - **Property 12: Toast Tip Desteği**
    - **Validates: Requirements 15.2**

  - [x] 7.4 `src/components/ui/Toast.tsx` bileşenini oluştur
    - `react-native-reanimated` `SlideInUp` / `SlideOutUp` animasyonları
    - `success`, `error`, `warning`, `info` tipleri için farklı renkler
    - _Requirements: 15.1, 15.2, 15.4_

- [x] 8. `BottomSheet` bileşenini oluştur
  - `src/components/ui/BottomSheet.tsx` dosyasını oluştur
  - `PanGestureHandler` + `useAnimatedGestureHandler` ile sürükleme
  - Drag handle, backdrop karartma ve backdrop tıklamasında kapanma
  - `react-native-reanimated` ile smooth kapanma animasyonu
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 9. `useAudioPlayer` hook'unu oluştur
  - `src/hooks/useAudioPlayer.ts` dosyasını oluştur
  - `expo-av` `Audio.Sound` API'si ile `loadTrack`, `play`, `pause`, `stop`, `setVolume`, `unload` metodlarını uygula
  - `musicVolume` değiştiğinde `sound.setVolumeAsync(volume / 100)` çağır
  - Unmount'ta `sound.unloadAsync()` çağır
  - Free plan: yalnızca ilk 2 built-in parçaya erişim
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [x] 10. Checkpoint — Tüm testler geçmeli, sorularınız varsa sorun

- [x] 11. `Timeline` bileşenini pinch-to-zoom ile güncelle
  - `PinchGestureHandler` ekle; `pixelsPerSecond` state'ini `useSharedValue` ile Reanimated'a taşı
  - Zoom aralığını [5, 50] ile sınırla; zoom değiştiğinde playhead pozisyonunu yeniden hesapla
  - Timeline dokunuşunda `useHaptics().selection()` çağır
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 11.1 Property testi: Zoom hesaplama invariantları
    - **Property 13: Zoom Hesaplama Invariantları**
    - **Validates: Requirements 8.2, 8.4**

- [x] 12. `VideoPlayer` bileşenini zaman overlay ve export sonrası butonlarla güncelle
  - Sol alt köşeye `{currentTime} / {totalDuration}` overlay ekle (`mm:ss` formatı, yarı saydam arka plan)
  - Export tamamlandığında "Kamera Rulosuna Kaydet" ve "Paylaş" butonlarını göster
  - Butonlar `mediaService.saveToLibrary()` ve `mediaService.share()` çağırır
  - Trim aralığı (`trimStart`, `trimEnd`) oynatmayı sınırlar
  - _Requirements: 7.1, 9.2, 10.1, 10.2, 10.3, 10.4_

- [x] 13. `SubtitleStylePicker` bileşenini oluştur
  - `src/components/editors/SubtitleStylePicker.tsx` dosyasını oluştur
  - Yatay kaydırılabilir preset listesi (Classic, Netflix, TikTok, Neon, Minimal, Karaoke)
  - Font boyutu slider (14-48pt), metin rengi, arka plan rengi, pozisyon ve animasyon toggle'ları
  - Free plan: Classic dışındaki preset'leri 🔒 ile göster; tıklandığında paywall'a yönlendir
  - Stil değişikliğinde `editorStore.setSubtitleStyle()` çağır
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 13.1 Property testi: Subtitle style preset kilidi
    - **Property 8: Subtitle Style Preset Kilidi**
    - **Validates: Requirements 12.3, 20.4**

- [x] 14. `SubtitlePreview` bileşenini karaoke modu için güncelle
  - `preset === 'karaoke'` ise her kelimeyi ayrı `Text` bileşeni olarak render et
  - `playbackPosition`'a göre aktif kelimeyi vurgula (farklı renk/arka plan)
  - `@shopify/react-native-skia` ile glow efekti uygula
  - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ]* 14.1 Property testi: Karaoke render invariantları
    - **Property 15: Karaoke Render Invariantları**
    - **Validates: Requirements 13.1, 13.2**

- [x] 15. `useVideoEditor` hook'unu `useHaptics` ve `useToast` ile güncelle
  - `Alert.alert` çağrılarını `useToast` ile değiştir
  - `detectSilences` tamamlandığında `useHaptics().impact(Medium)` çağır
  - `exportVideo` başlangıç ve bitişinde `useHaptics().notification(Success)` çağır
  - `SubtitleStylePicker`'ı editor ekranına entegre et
  - _Requirements: 2.6, 18.1, 18.2, 18.3, 18.4_

- [x] 16. Trim validasyonu ve `adjustSettings` entegrasyonu
  - `app/editor/[id].tsx` Adjust tab'ına `trimStart` / `trimEnd` için `mm:ss.ms` formatında zaman seçici ekle
  - `trimStart >= trimEnd` durumunda export butonunu devre dışı bırak ve inline hata mesajı göster
  - `exportVideo` çağrısına `-ss {trimStart} -to {trimEnd}` parametrelerini ekle
  - _Requirements: 9.1, 9.3, 9.4, 9.5_

  - [ ]* 16.1 Property testi: Trim aralığı geçerliliği
    - **Property 10: Trim Aralığı Geçerliliği**
    - **Validates: Requirements 9.5**

- [x] 17. Free plan sınırlarını tutarlı biçimde uygula
  - `subscriptionStore` metodlarının (`canCreateProject`, `canExportDuration`, `canRemoveSilence`, `hasWatermark`, `canUseSubtitleStyle`) tüm gated noktalarda kullanıldığını doğrula
  - Kilitli özelliklerde 🔒 ikonu göster; tıklandığında `/paywall` rotasına yönlendir
  - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

  - [ ]* 17.1 Property testi: Free plan proje sayısı sınırı
    - **Property 5: Free Plan Proje Sayısı Sınırı**
    - **Validates: Requirements 20.1**

  - [ ]* 17.2 Property testi: Free plan sessizlik kaldırma sınırı
    - **Property 6: Free Plan Sessizlik Kaldırma Sınırı**
    - **Validates: Requirements 3.4, 20.5**

  - [ ]* 17.3 Property testi: Free plan watermark invariantı
    - **Property 7: Free Plan Watermark Invariantı**
    - **Validates: Requirements 20.3**

- [x] 18. Checkpoint — Tüm testler geçmeli, sorularınız varsa sorun

- [x] 19. `HomeScreen`'e Lottie empty state animasyonu ekle
  - `lottie-react-native` ile animasyonlu boş durum göster
  - Lottie yüklenemezse statik ikon ile fallback göster
  - "İlk videonu içe aktar" CTA butonu ekle
  - _Requirements: 16.1, 16.2, 16.3_

- [x] 20. `SettingsScreen`'i eksik özelliklerle güncelle
  - Whisper model indirme durumu (indirildi/indirilmedi) ve model boyutunu göster
  - "Whisper Modelini İndir" butonu ve indirme progress bar'ı ekle
  - `expo-constants` ile uygulama versiyonunu dinamik olarak göster
  - "Uygulamayı Değerlendir" butonu: `expo-web-browser` ile App Store/Play Store sayfasını aç
  - Haptic Feedback toggle'ını `settingsStore.setHapticEnabled()` ile bağla
  - `settingsStore`'dan `defaultResolution` ve `defaultAspectRatio` oku/yaz
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [x] 21. `app.json` izin manifest'lerini güncelle
  - `expo.ios.infoPlist`'e `NSPhotoLibraryUsageDescription`, `NSMicrophoneUsageDescription`, `NSCameraUsageDescription` ekle
  - `expo.android.permissions`'a `READ_MEDIA_VIDEO`, `WRITE_EXTERNAL_STORAGE`, `READ_EXTERNAL_STORAGE`, `CAMERA`, `RECORD_AUDIO` ekle
  - `expo.plugins` listesine `expo-media-library` ve `expo-av` plugin'lerini ekle
  - _Requirements: 19.1, 19.2, 19.3_

- [x] 22. Son checkpoint — Tüm testler geçmeli, sorularınız varsa sorun

## Notes

- `*` ile işaretli görevler isteğe bağlıdır; MVP için atlanabilir
- Her görev ilgili requirements'a referans verir
- Property testleri `fast-check` kütüphanesiyle yazılır (`npm install --save-dev fast-check`)
- Test dosyaları `__tests__/` dizini altında design.md'deki yapıya göre organize edilir
