# Requirements Document

## Introduction

BlitzCut uygulaması için kapsamlı native entegrasyonlar ve editor geliştirmeleri. Bu özellik paketi; gerçek FFmpeg komutlarıyla video işleme, whisper.rn ile offline transkripsiyon, gelişmiş timeline etkileşimleri, eksik UI bileşenleri ve platform izin yönetimini kapsar. Tüm mock servisler gerçek native implementasyonlarla değiştirilecek, free/premium plan sınırları uygulanacak ve fiziksel cihazda çalışacak şekilde hazırlanacaktır.

## Glossary

- **FFmpegService**: ffmpeg-kit-react-native kütüphanesini kullanan video/ses işleme servisi
- **TranscriptionService**: whisper.rn kütüphanesini kullanan offline konuşma-metin dönüştürme servisi
- **SilenceService**: FFmpeg stderr çıktısını parse eden sessizlik algılama yardımcı servisi
- **Timeline**: Yatay kaydırılabilir dalga formu ve zaman çizelgesi bileşeni
- **VideoPlayer**: expo-video tabanlı video oynatıcı bileşeni
- **SubtitleStylePicker**: Altyazı font, renk, boyut ve animasyon seçici bileşeni
- **BottomSheet**: Sürükleyerek kapatılabilen modal panel bileşeni
- **Toast**: Alert.alert yerine kullanılan geçici bildirim bileşeni
- **EditorStore**: Zustand tabanlı editor durum yönetim store'u
- **Whisper_Model**: ggml-tiny.bin (~75MB) offline konuşma tanıma modeli
- **ConcatDemuxer**: FFmpeg'in birden fazla video segmentini birleştiren -f concat yöntemi
- **SRT**: SubRip altyazı dosya formatı (sequence, timestamp, text)
- **Camera_Roll**: Cihazın fotoğraf/video galerisine erişim (expo-media-library)
- **Haptic**: Dokunsal geri bildirim (expo-haptics)
- **Free_Plan**: Maksimum 3 proje, 60 saniye export, watermark, sadece Classic altyazı stili
- **Premium_Plan**: Sınırsız proje, watermark yok, tüm özellikler açık

---

## Requirements

### Requirement 1: FFmpeg Gerçek Entegrasyonu — Ses Çıkarma

**User Story:** Bir video editörü kullanıcısı olarak, videomdan gerçek WAV ses dosyası çıkarmak istiyorum; böylece Whisper transkripsiyon servisi doğru çalışabilsin.

#### Acceptance Criteria

1. WHEN `extractAudio(videoPath)` çağrıldığında, THE FFmpegService SHALL `ffmpeg -i {videoPath} -vn -acodec pcm_s16le -ar 16000 -ac 1 {outputWav}` komutunu çalıştırır ve geçerli bir `.wav` dosya yolu döndürür
2. WHEN FFmpeg komutu başarısız olduğunda, THE FFmpegService SHALL hata mesajını içeren bir `Error` fırlatır
3. THE FFmpegService SHALL çıktı dosyasını `FileSystem.cacheDirectory + 'temp/'` dizinine yazar
4. WHEN FFmpeg komutu tamamlandığında, THE FFmpegService SHALL `ReturnCode.isSuccess(returnCode)` ile başarı kontrolü yapar

---

### Requirement 2: FFmpeg Gerçek Entegrasyonu — Sessizlik Algılama

**User Story:** Bir video editörü kullanıcısı olarak, videodaki sessiz bölgeleri otomatik olarak tespit etmek istiyorum; böylece gereksiz duraksamaları kaldırabileyim.

#### Acceptance Criteria

1. WHEN `detectSilences(audioPath, threshold, minDuration)` çağrıldığında, THE FFmpegService SHALL `ffmpeg -i {audioPath} -af "silencedetect=n={threshold}dB:d={minDuration}" -f null -` komutunu çalıştırır
2. THE FFmpegService SHALL FFmpeg çıktısını stdout'tan değil, `FFmpegKitConfig` log callback'inden (stderr) okur
3. THE SilenceService SHALL stderr metninde `silence_start: {float}` ve `silence_end: {float}` pattern'lerini regex ile parse eder
4. WHEN sessizlik algılandığında, THE SilenceService SHALL her segment için `{ start, end, duration, excluded: false }` nesnesi döndürür
5. IF hiç sessizlik bulunamazsa, THE FFmpegService SHALL boş dizi döndürür ve kullanıcıya bildirim gösterilir
6. WHEN sessizlik algılama tamamlandığında, THE EditorStore SHALL `silenceSegments` state'ini günceller ve Haptic feedback tetiklenir

---

### Requirement 3: FFmpeg Gerçek Entegrasyonu — Sessizlik Kaldırma

**User Story:** Bir video editörü kullanıcısı olarak, tespit edilen sessiz bölgeleri videodan kaldırmak istiyorum; böylece daha akıcı bir içerik elde edeyim.

#### Acceptance Criteria

1. WHEN `removeSilences(videoPath, keepSegments, padding)` çağrıldığında, THE FFmpegService SHALL concat demuxer formatında bir liste dosyası oluşturur
2. THE FFmpegService SHALL concat liste dosyasında her segment için `file '{absolutePath}'`, `inpoint {start}`, `outpoint {end}` satırlarını yazar
3. THE FFmpegService SHALL `ffmpeg -f concat -safe 0 -i {listFile} -c copy {output}` komutunu çalıştırır
4. WHEN Free_Plan aktifse, THE FFmpegService SHALL yalnızca videonun ilk 30 saniyesindeki sessizlikleri kaldırır
5. WHEN işlem tamamlandığında, THE FFmpegService SHALL çıktı dosya yolunu döndürür ve EditorStore güncellenir

---

### Requirement 4: FFmpeg Gerçek Entegrasyonu — Video Export

**User Story:** Bir video editörü kullanıcısı olarak, videomu H.264 formatında belirli çözünürlük ve platform ayarlarıyla export etmek istiyorum.

#### Acceptance Criteria

1. WHEN `exportVideo(config)` çağrıldığında, THE FFmpegService SHALL `-c:v libx264 -preset fast -crf 23` parametrelerini kullanır
2. THE FFmpegService SHALL `-vf "scale={width}:{height}"` filtresiyle hedef çözünürlüğe ölçekler
3. WHERE `config.watermark` true ise, THE FFmpegService SHALL `-vf "drawtext=text='BlitzCut':x=w-tw-10:y=h-th-10:fontsize=24:fontcolor=white@0.5"` filtresini uygular
4. WHEN export tamamlandığında, THE FFmpegService SHALL `onProgress(progress, step)` callback'ini her adımda çağırır
5. WHEN Free_Plan aktifse ve video 60 saniyeden uzunsa, THE FFmpegService SHALL export işlemini reddeder ve kullanıcıyı paywall'a yönlendirir
6. WHEN export başarılı olduğunda, THE FFmpegService SHALL çıktı dosya yolunu döndürür

---

### Requirement 5: Whisper.rn Gerçek Entegrasyonu — Model Yönetimi

**User Story:** Bir video editörü kullanıcısı olarak, Whisper modelini cihazıma indirmek istiyorum; böylece internet bağlantısı olmadan transkripsiyon yapabileyim.

#### Acceptance Criteria

1. THE TranscriptionService SHALL model varlığını `FileSystem.documentDirectory + 'models/ggml-tiny.bin'` yolunda kontrol eder
2. WHEN model mevcut değilse, THE TranscriptionService SHALL `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin` adresinden `FileSystem.downloadAsync()` ile indirir
3. WHEN indirme devam ederken, THE TranscriptionService SHALL `onProgress(downloadedBytes / totalBytes)` callback'ini çağırır ve kullanıcıya gerçek ilerleme gösterilir
4. WHEN indirme tamamlandığında, THE TranscriptionService SHALL model dosyasının varlığını doğrular
5. IF indirme başarısız olursa, THE TranscriptionService SHALL hata fırlatır ve kullanıcıya yeniden deneme seçeneği sunar

---

### Requirement 6: Whisper.rn Gerçek Entegrasyonu — Transkripsiyon

**User Story:** Bir video editörü kullanıcısı olarak, videomun sesini seçtiğim dilde metne dönüştürmek istiyorum; böylece otomatik altyazı oluşturabileyim.

#### Acceptance Criteria

1. WHEN `transcribe(audioPath, language)` çağrıldığında, THE TranscriptionService SHALL `initWhisper({ filePath: modelPath })` ile Whisper context başlatır
2. THE TranscriptionService SHALL `ctx.transcribe(audioPath, { language })` çağrısıyla transkripsiyon yapar
3. THE TranscriptionService SHALL transkripsiyon sonucunu `SubtitleSegment[]` formatına parse eder; her segment `{ id, start, end, text }` içerir
4. WHEN transkripsiyon tamamlandığında, THE TranscriptionService SHALL SRT formatında dosya oluşturur ve dosya yolunu döndürür
5. FOR ALL geçerli `SubtitleSegment[]` dizileri, SRT dosyasını parse edip tekrar oluşturmak aynı segment içeriğini üretir (round-trip özelliği)
6. IF Whisper context başlatılamazsa, THE TranscriptionService SHALL anlamlı hata mesajıyla `Error` fırlatır

---

### Requirement 7: Export Sonrası Camera Roll Kayıt ve Paylaşım

**User Story:** Bir video editörü kullanıcısı olarak, export ettiğim videoyu kamera rulosuna kaydetmek ve paylaşmak istiyorum.

#### Acceptance Criteria

1. WHEN export tamamlandığında, THE VideoPlayer SHALL "Kamera Rulosuna Kaydet" ve "Paylaş" butonlarını gösterir
2. WHEN "Kamera Rulosuna Kaydet" butonuna basıldığında, THE App SHALL `MediaLibrary.requestPermissionsAsync()` ile izin ister
3. WHEN izin verildiğinde, THE App SHALL `MediaLibrary.saveToLibraryAsync(outputPath)` ile videoyu kaydeder
4. WHEN "Paylaş" butonuna basıldığında, THE App SHALL `Sharing.shareAsync(outputPath)` ile sistem paylaşım menüsünü açar
5. IF Camera Roll izni reddedilirse, THE App SHALL kullanıcıya izin ayarlarına yönlendirme seçeneği sunar

---

### Requirement 8: Timeline Pinch-to-Zoom

**User Story:** Bir video editörü kullanıcısı olarak, timeline'ı sıkıştırıp genişleterek zoom yapabilmek istiyorum; böylece hassas kesim noktalarını daha kolay görebileyim.

#### Acceptance Criteria

1. THE Timeline SHALL `react-native-gesture-handler` PinchGestureHandler kullanarak pinch-to-zoom destekler
2. WHEN kullanıcı timeline üzerinde pinch hareketi yaparsa, THE Timeline SHALL `pixelsPerSecond` değerini 5 ile 50 arasında günceller
3. THE Timeline SHALL zoom değişikliğini `react-native-reanimated` ile smooth animasyonla uygular
4. WHEN zoom değiştiğinde, THE Timeline SHALL playhead pozisyonunu yeni zoom seviyesine göre yeniden hesaplar
5. WHEN timeline'a dokunulduğunda, THE Timeline SHALL `expo-haptics` ile `selectionAsync()` haptic feedback tetikler

---

### Requirement 9: Video Trim (Başlangıç/Bitiş Kırpma)

**User Story:** Bir video editörü kullanıcısı olarak, videonun başlangıç ve bitiş noktalarını belirleyerek kırpmak istiyorum.

#### Acceptance Criteria

1. THE EditorStore SHALL `adjustSettings.trimStart` ve `adjustSettings.trimEnd` değerlerini saniye cinsinden saklar
2. WHEN trim değerleri değiştiğinde, THE VideoPlayer SHALL oynatmayı trim aralığıyla sınırlar
3. WHEN `exportVideo` çağrıldığında, THE FFmpegService SHALL `-ss {trimStart} -to {trimEnd}` parametrelerini FFmpeg komutuna ekler
4. THE Adjust_Tab SHALL `trimStart` ve `trimEnd` için `mm:ss.ms` formatında zaman seçici gösterir
5. IF `trimStart >= trimEnd` ise, THE App SHALL geçersiz trim aralığı hatası gösterir

---

### Requirement 10: Video Zaman Overlay

**User Story:** Bir video editörü kullanıcısı olarak, video oynatılırken sol alt köşede geçen süreyi görmek istiyorum.

#### Acceptance Criteria

1. THE VideoPlayer SHALL video sol alt köşesinde `{currentTime} / {totalDuration}` formatında zaman overlay gösterir
2. THE VideoPlayer SHALL zaman overlay'i `mm:ss` formatında günceller
3. THE VideoPlayer SHALL overlay'i yarı saydam siyah arka plan üzerinde beyaz metin olarak gösterir
4. WHILE video oynatılırken, THE VideoPlayer SHALL overlay'i her 100ms'de bir günceller

---

### Requirement 11: Arka Plan Müzik Oynatma

**User Story:** Bir video editörü kullanıcısı olarak, editörde arka plan müziği ekleyip önizleyebilmek istiyorum.

#### Acceptance Criteria

1. THE useAudioPlayer hook SHALL `expo-av` Audio API'sini kullanarak arka plan müziği oynatır
2. WHEN müzik parçası seçildiğinde, THE useAudioPlayer SHALL `Audio.Sound.createAsync()` ile ses yükler ve oynatır
3. WHEN `musicVolume` değiştiğinde, THE useAudioPlayer SHALL `sound.setVolumeAsync(volume / 100)` çağırır
4. WHEN video durdurulduğunda, THE useAudioPlayer SHALL arka plan müziğini de durdurur
5. WHEN bileşen unmount olduğunda, THE useAudioPlayer SHALL `sound.unloadAsync()` çağırarak kaynakları serbest bırakır
6. WHERE Free_Plan aktifse, THE useAudioPlayer SHALL yalnızca ilk 2 built-in parçaya erişime izin verir

---

### Requirement 12: SubtitleStylePicker Bileşeni

**User Story:** Bir video editörü kullanıcısı olarak, altyazılarımın font, renk, boyut ve animasyon özelliklerini özelleştirebilmek istiyorum.

#### Acceptance Criteria

1. THE SubtitleStylePicker SHALL font ailesi, metin rengi, arka plan rengi, font boyutu (14-48pt), pozisyon ve animasyon seçeneklerini sunar
2. WHEN bir stil seçeneği değiştirildiğinde, THE SubtitleStylePicker SHALL `editorStore.setSubtitleStyle()` çağırır ve önizleme anında güncellenir
3. WHERE Free_Plan aktifse, THE SubtitleStylePicker SHALL Classic dışındaki preset'leri kilitli (🔒) gösterir ve tıklandığında paywall'a yönlendirir
4. THE SubtitleStylePicker SHALL yatay kaydırılabilir preset listesi gösterir (Classic, Netflix, TikTok, Neon, Minimal, Karaoke)
5. WHEN Karaoke preset seçildiğinde, THE SubtitleStylePicker SHALL kelime bazlı highlight animasyonu için gerekli ayarları aktif eder

---

### Requirement 13: Karaoke/Word Highlight Altyazı

**User Story:** Bir video editörü kullanıcısı olarak, altyazıların karaoke stilinde kelime kelime vurgulanmasını istiyorum.

#### Acceptance Criteria

1. WHEN `subtitleStyle.preset === 'karaoke'` ise, THE SubtitlePreview SHALL her kelimeyi ayrı `Text` bileşeni olarak render eder
2. WHEN video oynatılırken, THE SubtitlePreview SHALL `playbackPosition`'a göre aktif kelimeyi vurgular
3. THE SubtitlePreview SHALL vurgulanan kelimeyi farklı renk ve/veya arka plan rengiyle gösterir
4. THE SubtitlePreview SHALL `@shopify/react-native-skia` ile glow efekti uygular

---

### Requirement 14: BottomSheet Bileşeni

**User Story:** Bir video editörü kullanıcısı olarak, aşağıdan açılan panelleri sürükleyerek kapatabilmek istiyorum.

#### Acceptance Criteria

1. THE BottomSheet SHALL `react-native-gesture-handler` PanGestureHandler ile sürükleme hareketini algılar
2. WHEN kullanıcı BottomSheet'i aşağı sürüklediğinde, THE BottomSheet SHALL `react-native-reanimated` ile smooth kapanma animasyonu oynatır
3. THE BottomSheet SHALL üst kısmında görünür bir drag handle gösterir
4. WHEN BottomSheet açıldığında, THE BottomSheet SHALL arka planı karartır (backdrop)
5. WHEN backdrop'a tıklandığında, THE BottomSheet SHALL kapanır

---

### Requirement 15: Toast Bildirim Bileşeni

**User Story:** Bir video editörü kullanıcısı olarak, işlem sonuçlarını `Alert.alert` yerine daha az müdahaleci bildirimlerle görmek istiyorum.

#### Acceptance Criteria

1. THE Toast SHALL ekranın üst veya alt kısmında geçici bildirim gösterir
2. THE Toast SHALL `success`, `error`, `warning` ve `info` tiplerini destekler
3. WHEN Toast gösterildiğinde, THE Toast SHALL 3 saniye sonra otomatik olarak kaybolur
4. THE Toast SHALL `react-native-reanimated` ile slide-in/slide-out animasyonu kullanır
5. THE Toast SHALL aynı anda birden fazla bildirimi kuyrukta yönetir

---

### Requirement 16: Lottie Empty State Animasyonu

**User Story:** Bir video editörü kullanıcısı olarak, proje listesi boşken animasyonlu bir boş durum ekranı görmek istiyorum.

#### Acceptance Criteria

1. WHEN proje listesi boşsa, THE HomeScreen SHALL `lottie-react-native` ile animasyonlu boş durum gösterir
2. THE HomeScreen SHALL Lottie animasyonu yüklenemezse statik ikon ile fallback gösterir
3. THE HomeScreen SHALL boş durum ekranında "İlk videonu içe aktar" CTA butonu gösterir

---

### Requirement 17: Settings Eksiklikleri

**User Story:** Bir video editörü kullanıcısı olarak, ayarlar ekranında Whisper model durumu, uygulama versiyonu ve değerlendirme seçeneklerini görmek istiyorum.

#### Acceptance Criteria

1. THE SettingsScreen SHALL Whisper model indirme durumunu (indirildi/indirilmedi) ve model boyutunu gösterir
2. WHEN "Whisper Modelini İndir" butonuna basıldığında, THE SettingsScreen SHALL indirme ilerlemesini gösterir
3. THE SettingsScreen SHALL uygulama versiyonunu `expo-constants` ile dinamik olarak gösterir
4. WHEN "Uygulamayı Değerlendir" butonuna basıldığında, THE SettingsScreen SHALL `expo-web-browser` ile App Store/Play Store sayfasını açar
5. THE SettingsScreen SHALL Haptic Feedback toggle'ı `subscriptionStore` veya `AsyncStorage`'a kaydeder ve uygulama genelinde etkili olur

---

### Requirement 18: Haptic Feedback Entegrasyonu

**User Story:** Bir video editörü kullanıcısı olarak, önemli eylemlerde dokunsal geri bildirim almak istiyorum.

#### Acceptance Criteria

1. WHEN timeline'a dokunulduğunda, THE Timeline SHALL `Haptics.selectionAsync()` çağırır
2. WHEN export başladığında, THE App SHALL `Haptics.notificationAsync(NotificationFeedbackType.Success)` çağırır
3. WHEN export tamamlandığında, THE App SHALL `Haptics.notificationAsync(NotificationFeedbackType.Success)` çağırır
4. WHEN sessizlik algılandığında, THE App SHALL `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` çağırır
5. WHILE Haptic Feedback ayarı kapalıysa, THE App SHALL hiçbir haptic çağrısı yapmaz

---

### Requirement 19: iOS/Android İzin Manifest'leri

**User Story:** Bir uygulama geliştiricisi olarak, gerekli platform izinlerinin manifest dosyalarında tanımlı olmasını istiyorum; böylece uygulama mağaza onayı alabilsin.

#### Acceptance Criteria

1. THE iOS_App SHALL `Info.plist`'te `NSPhotoLibraryUsageDescription`, `NSMicrophoneUsageDescription` ve `NSCameraUsageDescription` anahtarlarını içerir
2. THE Android_App SHALL `AndroidManifest.xml`'de `READ_MEDIA_VIDEO`, `WRITE_EXTERNAL_STORAGE`, `READ_EXTERNAL_STORAGE`, `CAMERA` ve `RECORD_AUDIO` izinlerini içerir
3. THE App SHALL `app.json` içinde `expo.ios.infoPlist` ve `expo.android.permissions` alanlarında bu izinleri tanımlar
4. WHEN uygulama ilk açıldığında, THE App SHALL gerekli izinleri `expo-media-library` ve `expo-av` API'leri aracılığıyla ister

---

### Requirement 20: Free Plan Limitleri ve Paywall Yönlendirmeleri

**User Story:** Bir uygulama geliştiricisi olarak, free plan sınırlarının tüm gated özelliklerde tutarlı biçimde uygulanmasını istiyorum.

#### Acceptance Criteria

1. WHILE Free_Plan aktifse, THE App SHALL maksimum 3 proje oluşturulmasına izin verir; 4. proje oluşturma girişiminde paywall gösterilir
2. WHILE Free_Plan aktifse, THE FFmpegService SHALL 60 saniyeden uzun videoların export edilmesini engeller
3. WHILE Free_Plan aktifse, THE App SHALL tüm export'lara watermark ekler
4. WHILE Free_Plan aktifse, THE SubtitleStylePicker SHALL yalnızca Classic White preset'ini aktif gösterir
5. WHILE Free_Plan aktifse, THE FFmpegService SHALL sessizlik kaldırmayı yalnızca ilk 30 saniyeye uygular
6. THE App SHALL kilitli özelliklerde 🔒 ikonu gösterir ve tıklandığında `/paywall` rotasına yönlendirir
7. THE SubscriptionStore SHALL `isPremium` değerini Zustand persist middleware ile AsyncStorage'a kaydeder
