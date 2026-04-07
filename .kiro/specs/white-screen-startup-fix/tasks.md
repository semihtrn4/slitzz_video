# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - White Screen on Startup
  - **CRITICAL**: Bu testi düzeltme uygulanmadan ÖNCE yaz
  - **GOAL**: Bug'ın varlığını kanıtlayan counterexample'lar üret
  - **Scoped PBT Approach**: `isReady=false` durumunda `RootLayoutNav`'ı mock router ve mock AsyncStorage ile render et
  - Test: `RootLayoutNav` `isReady=false` iken `null` döndürüyor (beyaz ekran kanıtı)
  - Test: `checkOnboarding` içindeki `router.replace()` çağrısı `<Stack>` mount olmadan yapılıyor
  - Test: `expo-file-system/legacy` import'undan `documentDirectory` → `undefined` döndüğünü gözlemle
  - Test: 3 store eş zamanlı hydrate olurken `checkOnboarding`'in hydration tamamlanmadan çalıştığını gözlemle
  - Testi düzeltilmemiş kodda çalıştır — **BEKLENEN SONUÇ: BAŞARISIZ** (bug'ın varlığını kanıtlar)
  - Counterexample'ları belgele: "RootLayoutNav render çıktısı null — beyaz ekranın doğrudan kanıtı"
  - Görev tamamlandı sayılır: test yazıldı, çalıştırıldı ve başarısızlık belgelendi
  - _Requirements: 1.1, 1.2, 1.4, 1.6_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Onboarding ve Ana Ekran Yönlendirmesi
  - **IMPORTANT**: Observation-first metodolojisini uygula
  - Gözlemle: `onboarding_completed=null` → `/onboarding` yönlendirmesi düzeltilmemiş kodda çalışıyor
  - Gözlemle: `onboarding_completed='true'` → `/(tabs)` yönlendirmesi düzeltilmemiş kodda çalışıyor
  - Gözlemle: `FileSystem.documentDirectory` ve `cacheDirectory` development'ta doğru değer döndürüyor
  - Property-based test: rastgele `onboarding_completed` değerleriyle (null, 'true', 'false', boş string) yönlendirme mantığının doğru çalıştığını doğrula
  - Property-based test: rastgele AsyncStorage gecikme süreleriyle store hydration tamamlanmadan navigasyon kararı verilmediğini doğrula
  - Testleri düzeltilmemiş kodda çalıştır — **BEKLENEN SONUÇ: BAŞARILI** (baseline davranışı belgeler)
  - Görev tamamlandı sayılır: testler yazıldı, çalıştırıldı ve düzeltilmemiş kodda geçiyor
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix: White Screen Startup — Tüm Bug Condition'ları Gider

  - [x] 3.1 `app.json` — `newArchEnabled: false` yap
    - `"newArchEnabled": true` → `"newArchEnabled": false` olarak değiştir
    - Bu tek satır `ffmpeg-kit-react-native 6.0.0` ve `whisper.rn 0.5.5`'in eski bridge mimarisiyle çalışmasını sağlar
    - _Bug_Condition: C3 — newArchEnabled=true + ffmpeg-kit-react-native/whisper.rn yüklü_
    - _Expected_Behavior: Native modüller Fabric/TurboModules hatası olmadan başlatılır_
    - _Requirements: 1.4, 2.4_

  - [x] 3.2 `package.json` — `react-native-worklets` bağımlılığını kaldır
    - `"react-native-worklets": "0.5.1"` satırını `dependencies`'den sil
    - `react-native-reanimated ~4.1.1` kendi worklets runtime'ını içeriyor; ayrı pakete gerek yok
    - Değişiklikten sonra `npm install` çalıştır
    - _Bug_Condition: C6 — react-native-worklets@0.5.1 + react-native-reanimated@4.1.1 çakışması_
    - _Expected_Behavior: Tek worklets runtime, animasyon init hatası yok_
    - _Requirements: 1.7, 2.7_

  - [x] 3.3 `app/(tabs)/create.tsx` — `expo-file-system/legacy` → `expo-file-system`
    - `import * as FileSystem from 'expo-file-system/legacy'` → `import * as FileSystem from 'expo-file-system'`
    - `const documentDirectory = (FileSystem as any).documentDirectory` satırını kaldır
    - `const cacheDirectory = (FileSystem as any).cacheDirectory` satırını kaldır
    - `const { documentDirectory, cacheDirectory } = FileSystem` ile değiştir (cast gerekmez)
    - _Bug_Condition: C4 — expo-file-system/legacy production Metro bundle'da çözümlenemiyor_
    - _Expected_Behavior: documentDirectory ve cacheDirectory production build'de doğru string döndürür_
    - _Preservation: Video kopyalama ve proje oluşturma akışı değişmez_
    - _Requirements: 1.6, 2.6, 3.3_

  - [x] 3.4 `src/services/ffmpegService.ts` — `expo-file-system/legacy` → `expo-file-system`
    - `import * as FileSystem from 'expo-file-system/legacy'` → `import * as FileSystem from 'expo-file-system'`
    - `const documentDirectory = (FileSystem as any).documentDirectory` satırını kaldır
    - `const cacheDirectory = (FileSystem as any).cacheDirectory` satırını kaldır
    - `const { documentDirectory, cacheDirectory } = FileSystem` ile değiştir
    - _Bug_Condition: C4 — expo-file-system/legacy production Metro bundle'da çözümlenemiyor_
    - _Expected_Behavior: FFmpeg işlemleri (thumbnail, ses çıkarma, export) production'da çalışır_
    - _Preservation: FFmpeg thumbnail, extractAudio, detectSilences, exportVideo akışları değişmez_
    - _Requirements: 1.6, 2.6, 3.4, 3.8_

  - [x] 3.5 `src/services/transcriptionService.ts` — `expo-file-system/legacy` → `expo-file-system`
    - `import * as FileSystem from 'expo-file-system/legacy'` → `import * as FileSystem from 'expo-file-system'`
    - `const documentDirectory = (FileSystem as any).documentDirectory` satırını kaldır
    - `const cacheDirectory = (FileSystem as any).cacheDirectory` satırını kaldır
    - `const { documentDirectory, cacheDirectory } = FileSystem` ile değiştir
    - `generateSRT` içindeki `(FileSystem as any).cacheDirectory` kullanımını da `cacheDirectory` ile değiştir
    - _Bug_Condition: C4 — expo-file-system/legacy production Metro bundle'da çözümlenemiyor_
    - _Expected_Behavior: Model indirme, SRT/ASS oluşturma production'da çalışır_
    - _Preservation: Whisper transkripsiyon akışı değişmez_
    - _Requirements: 1.6, 2.6, 3.5_

  - [x] 3.6 `app/_layout.tsx` — `return null` → Koyu View + Navigation Guard + Store Hydration Bekleme
    - `isReady=false` iken `return null` yerine `<View style={{ flex: 1, backgroundColor: '#000' }} />` döndür
    - `View` import'unu `react-native`'den ekle
    - `useSubscriptionStore` import'unu ekle
    - `targetRoute` state'i ekle: `const [targetRoute, setTargetRoute] = useState<string | null>(null)`
    - `checkOnboarding` fonksiyonunu `useSubscriptionStore`'un `onRehydrateStorage` callback'i içine taşı:
      - Store hydration tamamlandığında AsyncStorage'dan `onboarding_completed` oku
      - `targetRoute`'u set et, ardından `setIsReady(true)` çağır
    - `router.replace()` ve `SplashScreen.hideAsync()` çağrılarını `isReady` değiştiğinde tetiklenen ayrı bir `useEffect`'e taşı:
      - `useEffect(() => { if (isReady && targetRoute) { router.replace(targetRoute); SplashScreen.hideAsync(); } }, [isReady, targetRoute])`
    - `<Stack>` yalnızca `isReady=true` olduğunda render edilir — navigation guard sağlanmış olur
    - _Bug_Condition: C1 (return null), C2 (erken router.replace), C5 (store hydration race condition)_
    - _Expected_Behavior: isReady=false iken koyu ekran; router.replace yalnızca Stack mount sonrası; navigasyon kararı store hydration sonrası_
    - _Preservation: onboarding_completed=null → /onboarding; onboarding_completed='true' → /(tabs)_
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.6_

  - [x] 3.7 `app/(tabs)/index.tsx` — MediaLibrary izin isteğini mount'tan kaldır
    - `useEffect` içindeki `checkPermissions` fonksiyonunu ve `void checkPermissions()` çağrısını kaldır
    - `MediaLibrary` import'unu koru (başka yerlerde kullanılıyor olabilir; kullanılmıyorsa kaldır)
    - İzin isteği `pickFromGallery` veya kullanıcı etkileşimi anında yapılacak (create.tsx'de zaten `ImagePicker.launchImageLibraryAsync` çağrısı var, sistem izni otomatik ister)
    - _Bug_Condition: C6 — mount anında async izin isteği navigation race condition oluşturuyor_
    - _Expected_Behavior: Tab navigator mount olduğunda sistem dialog'u açılmaz; izin kullanıcı etkileşiminde istenir_
    - _Preservation: Video import akışı değişmez_
    - _Requirements: 1.8, 2.8, 3.3_

  - [x] 3.8 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - White Screen on Startup
    - **IMPORTANT**: Görev 1'deki AYNI testi yeniden çalıştır — yeni test yazma
    - Görev 1'deki test beklenen davranışı encode ediyor
    - Bu test geçtiğinde bug'ın düzeltildiği doğrulanmış olur
    - `RootLayoutNav` `isReady=false` iken `null` değil koyu `<View>` döndürüyor
    - `router.replace` yalnızca `isReady=true` ve `<Stack>` mount olduktan sonra çağrılıyor
    - **BEKLENEN SONUÇ: BAŞARILI** (bug düzeltildi)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 3.9 Verify preservation tests still pass
    - **Property 2: Preservation** - Onboarding ve Ana Ekran Yönlendirmesi
    - **IMPORTANT**: Görev 2'deki AYNI testleri yeniden çalıştır — yeni test yazma
    - Görev 2'deki preservation testlerini çalıştır
    - **BEKLENEN SONUÇ: BAŞARILI** (regresyon yok)
    - Tüm testlerin düzeltme sonrasında da geçtiğini doğrula

- [x] 4. Checkpoint — Tüm testlerin geçtiğini doğrula
  - Tüm testlerin geçtiğinden emin ol; sorular çıkarsa kullanıcıya sor
  - Production build alarak (veya simüle ederek) uygulama başlatma akışını doğrula: splash screen gizleniyor → koyu ekran → doğru rota
  - Onboarding tamamlanmamış kullanıcı akışını doğrula: başlatma → /onboarding → tamamla → /(tabs)
  - Video import akışını doğrula: galeri seç → proje oluştur → editöre git (FileSystem fix sonrası)
