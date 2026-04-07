# Bugfix Requirements Document

## Introduction

SlitzCut / BlitzCut uygulaması, production build'de (GitHub Actions ile derlenen APK/IPA) açılışta beyaz ekranda kalıyor ve kullanıcıya hiçbir içerik göstermiyor. Sorun yalnızca production build'de ortaya çıkıyor; Expo Go veya development build'de görülmüyor. Analiz, birden fazla eş zamanlı hatanın bir araya gelmesiyle oluşan bu sorunu altı ayrı başlık altında tanımlamıştır.

---

## Bug Analysis

### Current Behavior (Defect)

**1. `_layout.tsx` — Race Condition + `return null` (KRİTİK)**

1.1 WHEN uygulama ilk açıldığında `isReady` state'i `false` iken THEN sistem `return null` döndürür ve ekran tamamen boş (beyaz) kalır

1.2 WHEN `checkOnboarding` async fonksiyonu çalışırken `router.replace()` çağrısı yapıldığında THEN sistem Expo Router navigation stack henüz mount olmadığı için navigasyonu sessizce yok sayar veya crash eder

1.3 WHEN production build'de native modüller yüklenirken gecikme oluştuğunda THEN `isReady` false kalma süresi uzar ve beyaz ekran daha uzun süre görünür

**2. `newArchEnabled: true` + Native Kütüphane Uyumsuzluğu (KRİTİK)**

1.4 WHEN `app.json`'da `"newArchEnabled": true` ayarı aktifken `ffmpeg-kit-react-native 6.0.0` veya `whisper.rn 0.5.5` yüklendiğinde THEN sistem Fabric/TurboModules mimarisiyle uyumsuz native modül hatası nedeniyle sessiz crash yaşar ve beyaz ekranda kalır

**3. Zustand Store'larının Eş Zamanlı AsyncStorage Okuması (YÜKSEK)**

1.5 WHEN uygulama açılışında `subscriptionStore`, `projectStore` ve `settingsStore` aynı anda AsyncStorage'a async okuma isteği gönderdiğinde THEN sistem `_layout.tsx`'deki `checkOnboarding` ile race condition oluşturur ve başlangıç durumu tutarsız yüklenir

**4. `expo-file-system/legacy` Import Yolu (YÜKSEK)**

1.6 WHEN `create.tsx`, `ffmpegService.ts` ve `transcriptionService.ts` dosyalarında `import * as FileSystem from 'expo-file-system/legacy'` kullanıldığında THEN sistem `expo-file-system ~19.x` production build'inde `/legacy` alt yolunu çözemez ve modül bulunamadığı için uygulama başlatma aşamasında hata verir

**5. `react-native-worklets 0.5.1` Sürüm Uyumsuzluğu (ORTA)**

1.7 WHEN `react-native-reanimated ~4.1.1` ile birlikte `react-native-worklets 0.5.1` yüklü olduğunda THEN sistem iki ayrı worklets runtime'ının çakışması nedeniyle animasyon başlatma hatası üretir

**6. `MediaLibrary.requestPermissionsAsync()` Ana Ekranda (ORTA)**

1.8 WHEN `app/(tabs)/index.tsx` bileşeni mount olduğunda `useEffect` içinde `MediaLibrary.requestPermissionsAsync()` çağrısı yapıldığında THEN sistem navigation stack henüz tam oturmadan async izin isteği başlatır ve bu durum başlangıç navigasyonuyla çakışabilir

---

### Expected Behavior (Correct)

**1. `_layout.tsx` — Güvenli Başlatma**

2.1 WHEN uygulama ilk açıldığında `isReady` state'i `false` iken THEN sistem `return null` yerine splash screen'i görünür tutmalı ve beyaz ekran göstermemelidir (SplashScreen zaten `preventAutoHideAsync` ile tutulmaktadır; `null` render yerine bir loading view veya SplashScreen yeterlidir)

2.2 WHEN `checkOnboarding` async fonksiyonu tamamlandığında THEN sistem `router.replace()` çağrısını yalnızca navigation stack mount olduktan sonra yapmalı ve yönlendirme güvenilir biçimde gerçekleşmelidir

2.3 WHEN production build'de native modüller yüklenirken gecikme oluştuğunda THEN sistem splash screen'i gizlemeden önce tüm başlatma adımlarının tamamlanmasını beklemelidir

**2. `newArchEnabled` Uyumluluğu**

2.4 WHEN uygulama production build'de çalıştığında THEN sistem `ffmpeg-kit-react-native` ve `whisper.rn` ile uyumlu bir mimari yapılandırmasıyla başlamalı ve native modül hatası olmadan açılmalıdır

**3. Store Başlatma Sıralaması**

2.5 WHEN uygulama açılışında Zustand store'ları AsyncStorage'dan veri yüklediğinde THEN sistem `checkOnboarding` navigasyon kararını vermeden önce kritik store'ların (en azından `subscriptionStore`) yüklenmesini beklemelidir

**4. `expo-file-system` Import Yolu**

2.6 WHEN `create.tsx`, `ffmpegService.ts` ve `transcriptionService.ts` dosyaları `expo-file-system` modülünü import ettiğinde THEN sistem `/legacy` alt yolu yerine doğrudan `'expo-file-system'` import yolunu kullanmalı ve production build'de modül başarıyla çözümlenmelidir

**5. Worklets Uyumluluğu**

2.7 WHEN `react-native-reanimated ~4.1.1` kullanıldığında THEN sistem ayrı `react-native-worklets` paketi olmadan çalışmalı veya uyumlu bir sürümle çalışmalı ve runtime çakışması yaşanmamalıdır

**6. İzin İsteği Zamanlaması**

2.8 WHEN `app/(tabs)/index.tsx` bileşeni mount olduğunda THEN sistem `MediaLibrary.requestPermissionsAsync()` çağrısını yalnızca navigation stack tamamen oturduğunda ve kullanıcı etkileşime hazır olduğunda yapmalıdır

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN kullanıcı uygulamayı ilk kez açtığında ve onboarding tamamlanmamışsa THEN sistem SHALL CONTINUE TO kullanıcıyı onboarding ekranına yönlendirmelidir

3.2 WHEN kullanıcı uygulamayı daha önce onboarding'i tamamlamış olarak açtığında THEN sistem SHALL CONTINUE TO kullanıcıyı doğrudan `/(tabs)` ana ekranına yönlendirmelidir

3.3 WHEN kullanıcı galeriden video seçtiğinde THEN sistem SHALL CONTINUE TO videoyu başarıyla içe aktarmalı ve proje oluşturmalıdır

3.4 WHEN kullanıcı FFmpeg tabanlı bir işlem (thumbnail oluşturma, ses çıkarma, sessizlik tespiti) başlattığında THEN sistem SHALL CONTINUE TO bu işlemleri doğru biçimde tamamlamalıdır

3.5 WHEN kullanıcı whisper.rn ile transkripsiyon başlattığında THEN sistem SHALL CONTINUE TO ses dosyasını başarıyla transkribe etmelidir

3.6 WHEN uygulama yeniden başlatıldığında THEN sistem SHALL CONTINUE TO Zustand store'larındaki (projeler, ayarlar, abonelik) verileri AsyncStorage'dan doğru biçimde yüklemelidir

3.7 WHEN kullanıcı premium değilken proje oluşturma limitine ulaştığında THEN sistem SHALL CONTINUE TO paywall ekranını göstermelidir

3.8 WHEN kullanıcı video export ettiğinde THEN sistem SHALL CONTINUE TO seçilen çözünürlük ve ayarlarla videoyu başarıyla dışa aktarmalıdır
