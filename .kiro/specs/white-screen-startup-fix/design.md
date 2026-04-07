# White Screen Startup Fix — Bugfix Design

## Overview

BlitzCut / SlitzCut uygulaması production build'de (GitHub Actions APK/IPA) açılışta beyaz ekranda kalıyor. Sorun tek bir nedenden değil, birbirini tetikleyen altı ayrı hatanın bileşiminden kaynaklanıyor. Bu tasarım belgesi her hatayı ayrı bir bug condition olarak formalize eder, beklenen davranışı tanımlar, kök neden analizini belgeler ve test stratejisini ortaya koyar.

Düzeltme yaklaşımı: minimal, hedefli değişiklikler — her dosyada yalnızca ilgili satırlar değiştiriliyor, mevcut uygulama mantığına dokunulmuyor.

---

## Glossary

- **Bug_Condition (C)**: Beyaz ekrana yol açan koşulların kümesi — `isReady=false` iken `return null`, yanlış mimari flag, legacy import yolu, eş zamanlı store hydration, worklets çakışması, erken izin isteği
- **Property (P)**: Her bug condition için beklenen doğru davranış
- **Preservation**: Mevcut uygulama akışlarının (onboarding yönlendirme, video import, FFmpeg işlemleri, store kalıcılığı) değişmeden çalışmaya devam etmesi
- **RootLayoutNav**: `app/_layout.tsx` içindeki, navigation stack'i ve başlatma mantığını barındıran bileşen
- **checkOnboarding**: `_layout.tsx`'de AsyncStorage'dan onboarding durumunu okuyan ve `router.replace()` çağıran async fonksiyon
- **isReady**: `RootLayoutNav`'ın başlatma tamamlanana kadar `false` olan state değişkeni
- **onRehydrateStorage**: Zustand persist middleware'inin AsyncStorage okuma tamamlandığında çağırdığı callback
- **newArchEnabled**: `app.json`'da React Native Fabric/TurboModules mimarisini açan flag

---

## Bug Details

### Bug Condition

Beyaz ekran, aşağıdaki altı koşuldan bir veya birkaçı aynı anda gerçekleştiğinde ortaya çıkıyor:

**Formal Specification:**

```
FUNCTION isBugCondition(appState)
  INPUT: appState — { isReady, navigationMounted, storesHydrated,
                      newArchEnabled, fileSystemImport, workletsVersion }
  OUTPUT: boolean

  // C1: return null → beyaz ekran
  IF appState.isReady = false AND appState.renderOutput = null
    RETURN true

  // C2: navigation hazır değilken router.replace() çağrısı
  IF appState.navigationMounted = false AND router.replace() called
    RETURN true

  // C3: yeni mimari + uyumsuz native modüller
  IF appState.newArchEnabled = true
     AND ('ffmpeg-kit-react-native' OR 'whisper.rn') loaded
    RETURN true

  // C4: legacy import yolu production'da çözümlenemiyor
  IF appState.fileSystemImport = 'expo-file-system/legacy'
    RETURN true

  // C5: store hydration tamamlanmadan navigasyon kararı
  IF appState.storesHydrated = false AND checkOnboarding() called
    RETURN true

  // C6: worklets runtime çakışması
  IF 'react-native-worklets@0.5.1' installed
     AND 'react-native-reanimated@~4.1.1' installed
    RETURN true

  RETURN false
END FUNCTION
```

### Examples

- **C1**: `isReady=false` → `return null` → ekran tamamen boş, splash screen gizlendi
- **C2**: `checkOnboarding` async çalışırken `router.replace('/onboarding')` → navigation stack henüz mount olmadı → yönlendirme sessizce yok sayıldı, uygulama boş Stack'te kaldı
- **C3**: `newArchEnabled: true` + `ffmpeg-kit-react-native 6.0.0` → Fabric bridge hatası → native modül init crash → beyaz ekran
- **C4**: `import * as FileSystem from 'expo-file-system/legacy'` → production metro bundle'da `/legacy` subpath bulunamadı → modül yükleme hatası → uygulama başlamadı
- **C5**: `subscriptionStore`, `projectStore`, `settingsStore` aynı anda AsyncStorage okuyor → `checkOnboarding` henüz store verileri gelmeden `router.replace('/(tabs)')` çağırdı → yanlış başlangıç durumu
- **C6**: `react-native-worklets@0.5.1` + `react-native-reanimated@4.1.1` → iki ayrı worklets runtime → animasyon init hatası → uygulama crash

---

## Expected Behavior

### Preservation Requirements

**Değişmeden kalması gereken davranışlar:**

- Onboarding tamamlanmamış kullanıcı → `/onboarding` yönlendirmesi çalışmaya devam etmeli
- Onboarding tamamlanmış kullanıcı → `/(tabs)` yönlendirmesi çalışmaya devam etmeli
- Galeriden video seçme ve proje oluşturma akışı değişmemeli
- FFmpeg işlemleri (thumbnail, ses çıkarma, sessizlik tespiti, export) değişmemeli
- Whisper transkripsiyon akışı değişmemeli
- Zustand store'larının AsyncStorage'a yazma/okuma kalıcılığı değişmemeli
- Paywall gösterimi (free plan limiti) değişmemeli
- `documentDirectory` ve `cacheDirectory` değerleri doğru çalışmaya devam etmeli

**Kapsam:**

Bu düzeltmeler yalnızca başlatma sırasını, import yollarını ve konfigürasyon flag'lerini etkiliyor. Uygulama iş mantığına (video işleme, transkripsiyon, proje yönetimi) dokunulmuyor.

---

## Hypothesized Root Cause

### 1. `return null` + Erken `router.replace()` (`app/_layout.tsx`)

`RootLayoutNav` bileşeni `isReady=false` iken `return null` döndürüyor. Bu, React Native'in native view hiyerarşisine hiçbir şey render etmemesi anlamına geliyor — splash screen `preventAutoHideAsync` ile tutulmuş olsa bile, `SplashScreen.hideAsync()` `finally` bloğunda çağrıldığı için splash gizleniyor ve arkasında boş (beyaz) ekran kalıyor.

Aynı zamanda `checkOnboarding` içindeki `router.replace()` çağrısı, Expo Router'ın navigation container'ı henüz mount olmadan yapılıyor. Expo Router, `<Stack>` bileşeni render edilmeden önce navigation context'i hazır etmiyor; `return null` durumunda `<Stack>` hiç render edilmediği için navigation her zaman hazır değil.

### 2. `newArchEnabled: true` (`app.json`)

`ffmpeg-kit-react-native 6.0.0` ve `whisper.rn 0.5.5` Fabric/TurboModules (New Architecture) ile uyumlu değil. Bu paketler eski bridge mimarisine göre yazılmış. `newArchEnabled: true` ile build alındığında native modül kayıt mekanizması farklı çalışıyor ve bu paketler kendilerini doğru kaydedemeyerek sessiz crash'e yol açıyor.

### 3. `expo-file-system/legacy` Import Yolu

`expo-file-system ~19.x` sürümünde `/legacy` subpath export'u production Metro bundler tarafından çözümlenemiyor. Development'ta Expo Go kendi module resolution'ını kullandığı için sorun görünmüyor; production native build'de Metro'nun subpath resolution'ı farklı davranıyor.

### 4. Zustand Store Race Condition

Üç store (`projectStore`, `subscriptionStore`, `settingsStore`) uygulama mount olduğunda eş zamanlı olarak AsyncStorage'dan veri yüklemeye başlıyor. `checkOnboarding` ise bu yüklemelerden bağımsız olarak hemen çalışıyor. Sonuç: navigasyon kararı verildiğinde store'lar henüz hydrate olmamış olabilir, özellikle `subscriptionStore`'daki `isPremium` değeri yanlış başlangıç değeriyle kalabilir.

### 5. `react-native-worklets@0.5.1`

`react-native-reanimated ~4.1.1` kendi worklets runtime'ını içeriyor. Ayrıca `react-native-worklets@0.5.1` yüklü olduğunda iki runtime aynı anda init olmaya çalışıyor ve çakışıyor. Bu, animasyon kullanan ekranlarda (özellikle `FadeIn`, `FadeInUp` kullanan `index.tsx`) crash'e yol açıyor.

### 6. `MediaLibrary.requestPermissionsAsync()` Zamanlaması

`app/(tabs)/index.tsx`'de `useEffect` içinde `MediaLibrary.requestPermissionsAsync()` çağrısı yapılıyor. Bu, tab navigator mount olur olmaz tetikleniyor. Navigation stack henüz tam oturmadan async bir sistem dialog'u açılması, başlangıç navigasyonuyla race condition oluşturuyor.

---

## Correctness Properties

Property 1: Bug Condition — Başlatma Sırasında Beyaz Ekran Gösterilmemeli

_For any_ uygulama başlatma senaryosunda `isReady=false` iken, düzeltilmiş `RootLayoutNav` bileşeni `null` yerine koyu arka planlı bir `<View>` döndürmeli; `router.replace()` çağrısı yalnızca navigation stack mount olduktan sonra yapılmalı ve splash screen gizlendiğinde ekran boş kalmamalıdır.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — Onboarding ve Ana Ekran Yönlendirmesi Değişmemeli

_For any_ uygulama başlatma senaryosunda `isReady=true` olduktan sonra, düzeltilmiş kod onboarding durumuna göre doğru rotaya (`/onboarding` veya `/(tabs)`) yönlendirmeye devam etmeli; mevcut yönlendirme mantığı değişmemelidir.

**Validates: Requirements 3.1, 3.2**

Property 3: Preservation — Store Hydration Sonrası Navigasyon Kararı

_For any_ AsyncStorage okuma senaryosunda (hızlı veya yavaş), düzeltilmiş başlatma akışı kritik store'ların (`subscriptionStore`) hydration'ını tamamlamasını beklemeli ve navigasyon kararını yalnızca store verileri hazır olduktan sonra vermelidir.

**Validates: Requirements 2.5, 3.6**

Property 4: Preservation — FileSystem API Doğru Çalışmalı

_For any_ `documentDirectory` veya `cacheDirectory` kullanan işlemde (video kopyalama, thumbnail oluşturma, model indirme), düzeltilmiş import yolu (`'expo-file-system'`) bu değerleri production build'de de doğru döndürmeli ve dosya işlemleri başarıyla tamamlanmalıdır.

**Validates: Requirements 2.6, 3.3, 3.4, 3.5**

---

## Fix Implementation

### Değişiklik 1: `app/_layout.tsx` — `return null` → Koyu View + Navigation Guard

**Dosya**: `app/_layout.tsx`

**Fonksiyon**: `RootLayoutNav`

**Değişiklikler**:

1. `return null` yerine `backgroundColor: '#000000'` olan bir `<View style={{ flex: 1, backgroundColor: '#000' }} />` döndür — splash screen gizlendiğinde beyaz ekran yerine koyu ekran görünür
2. `checkOnboarding` içindeki `router.replace()` çağrısını `isReady` state'i set edildikten sonra, `<Stack>` render edildikten sonra çalışacak şekilde yeniden düzenle
3. Strateji: `isReady=false` iken loading view döndür, `isReady=true` olduğunda `<Stack>` render et ve `useEffect` dependency array'ine `isReady` ekleyerek navigation'ı `<Stack>` mount olduktan sonra tetikle
4. Store hydration için `useSubscriptionStore`'un `onRehydrateStorage` callback'ini kullan; hydration tamamlanana kadar `isReady=true` yapma

```
// Pseudocode
STATE: isReady = false, targetRoute = null

EFFECT (mount):
  subscriptionStore.onRehydrateStorage(() => {
    AsyncStorage.getItem('onboarding_completed').then(completed => {
      targetRoute = completed === 'true' ? '/(tabs)' : '/onboarding'
      setIsReady(true)
    })
  })

RENDER:
  IF NOT isReady:
    RETURN <View style={{ flex: 1, backgroundColor: '#000' }} />
  ELSE:
    RETURN <Stack> ... </Stack>

EFFECT (isReady changes):
  IF isReady AND targetRoute:
    router.replace(targetRoute)
    SplashScreen.hideAsync()
```

### Değişiklik 2: `app.json` — `newArchEnabled: false`

**Dosya**: `app.json`

**Değişiklik**: `"newArchEnabled": true` → `"newArchEnabled": false`

Bu tek satır değişikliği `ffmpeg-kit-react-native` ve `whisper.rn`'nin eski bridge mimarisiyle çalışmasını sağlar.

### Değişiklik 3: `expo-file-system/legacy` Import Yolları

**Dosyalar**:
- `app/(tabs)/create.tsx`
- `src/services/ffmpegService.ts`
- `src/services/transcriptionService.ts`

**Her dosyada değişiklik**:

```
// ÖNCE
import * as FileSystem from 'expo-file-system/legacy';
const documentDirectory = (FileSystem as any).documentDirectory;
const cacheDirectory = (FileSystem as any).cacheDirectory;

// SONRA
import * as FileSystem from 'expo-file-system';
const { documentDirectory, cacheDirectory } = FileSystem;
```

`documentDirectory` ve `cacheDirectory` `expo-file-system ~19.x`'in public API'sinde doğrudan export ediliyor; cast gerekmez.

### Değişiklik 4: `package.json` — `react-native-worklets` Kaldır

**Dosya**: `package.json`

**Değişiklik**: `"react-native-worklets": "0.5.1"` satırını `dependencies`'den kaldır.

`react-native-reanimated ~4.1.1` kendi worklets runtime'ını içeriyor; ayrı pakete gerek yok.

### Değişiklik 5: `app/(tabs)/index.tsx` — İzin İsteği Zamanlaması

**Dosya**: `app/(tabs)/index.tsx`

**Değişiklik**: `useEffect` içindeki `MediaLibrary.requestPermissionsAsync()` çağrısını mount anından kaldır. İzin isteğini kullanıcı ilk kez video oluşturmaya çalıştığında (örn. `handleContinue` içinde) yap.

```
// ÖNCE — mount anında
useEffect(() => {
  void checkPermissions();
}, []);

// SONRA — kullanıcı etkileşiminde (create.tsx handleContinue veya pickFromGallery içinde)
const pickFromGallery = async () => {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  // ...
};
```

---

## Testing Strategy

### Validation Approach

İki aşamalı yaklaşım: önce düzeltilmemiş kodda bug'ı gösteren counterexample'lar üret, sonra düzeltmenin doğru çalıştığını ve mevcut davranışın korunduğunu doğrula.

### Exploratory Bug Condition Checking

**Hedef**: Düzeltme uygulanmadan önce bug'ı gösteren test senaryoları çalıştır. Kök neden analizini doğrula veya çürüt.

**Test Planı**: `RootLayoutNav`'ı mock router ve mock AsyncStorage ile render et; `isReady=false` durumunda render çıktısını kontrol et.

**Test Senaryoları**:

1. **Beyaz Ekran Testi**: `isReady=false` iken `RootLayoutNav` render et → `null` döndüğünü gözlemle (düzeltilmemiş kodda başarısız olacak)
2. **Erken Navigation Testi**: `checkOnboarding` çalışırken `router.replace` çağrısının navigation mount olmadan yapıldığını gözlemle
3. **FileSystem Import Testi**: `expo-file-system/legacy`'den `documentDirectory` al → `undefined` döndüğünü gözlemle (production bundle simülasyonu)
4. **Store Race Condition Testi**: 3 store'u eş zamanlı hydrate et, `checkOnboarding`'in hydration tamamlanmadan çalıştığını gözlemle

**Beklenen Counterexample'lar**:
- `RootLayoutNav` render çıktısı `null` — beyaz ekranın doğrudan kanıtı
- `router.replace` mock'u `<Stack>` render edilmeden çağrılmış — navigation guard eksikliğinin kanıtı

### Fix Checking

**Hedef**: Bug condition'ın geçerli olduğu tüm girdiler için düzeltilmiş fonksiyonun beklenen davranışı ürettiğini doğrula.

**Pseudocode:**

```
FOR ALL appState WHERE isBugCondition(appState) DO
  result := RootLayoutNav_fixed(appState)
  ASSERT result IS NOT null
  ASSERT result.backgroundColor = '#000000'
  ASSERT router.replace NOT called before Stack mounted
  ASSERT SplashScreen.hideAsync NOT called before isReady = true
END FOR
```

### Preservation Checking

**Hedef**: Bug condition'ın geçerli olmadığı tüm girdiler için düzeltilmiş kodun orijinal kodla aynı sonucu ürettiğini doğrula.

**Pseudocode:**

```
FOR ALL appState WHERE NOT isBugCondition(appState) DO
  ASSERT RootLayoutNav_original(appState) = RootLayoutNav_fixed(appState)
END FOR
```

**Testing Approach**: Property-based testing özellikle store hydration race condition için öneriliyor çünkü:
- Farklı AsyncStorage gecikme senaryolarını otomatik üretiyor
- Manuel testlerin kaçırabileceği timing edge case'lerini yakalıyor
- Tüm non-buggy girdiler için davranışın değişmediğine dair güçlü garanti sağlıyor

**Test Senaryoları**:

1. **Onboarding Yönlendirme Koruması**: `onboarding_completed=null` → `/onboarding` yönlendirmesi hâlâ çalışıyor
2. **Ana Ekran Yönlendirme Koruması**: `onboarding_completed='true'` → `/(tabs)` yönlendirmesi hâlâ çalışıyor
3. **FileSystem API Koruması**: `documentDirectory` ve `cacheDirectory` düzeltilmiş import'tan doğru değer döndürüyor
4. **Store Persistence Koruması**: Store'lar AsyncStorage'a yazıp okuma döngüsünü doğru tamamlıyor

### Unit Tests

- `RootLayoutNav` `isReady=false` iken `null` değil koyu `<View>` döndürüyor
- `router.replace` yalnızca `isReady=true` ve `<Stack>` mount olduktan sonra çağrılıyor
- `FileSystem.documentDirectory` ve `FileSystem.cacheDirectory` düzeltilmiş import'tan `undefined` değil string döndürüyor
- `MediaLibrary.requestPermissionsAsync` mount anında değil, kullanıcı etkileşiminde çağrılıyor

### Property-Based Tests

- Rastgele AsyncStorage gecikme süreleriyle store hydration tamamlanmadan `checkOnboarding`'in navigasyon kararı vermediğini doğrula
- Rastgele `onboarding_completed` değerleriyle (null, 'true', 'false', boş string) yönlendirme mantığının doğru çalıştığını doğrula
- Rastgele dosya yollarıyla `documentDirectory` + path birleştirme işleminin production'da da doğru sonuç verdiğini doğrula

### Integration Tests

- Production benzeri ortamda uygulama başlatma → splash screen gizleniyor → koyu ekran → doğru rota
- Onboarding tamamlanmamış kullanıcı tam akışı: başlatma → onboarding → tamamla → `/(tabs)`
- Video import akışı: galeri seç → proje oluştur → editöre git (FileSystem fix sonrası)
- Store hydration sonrası premium durum kontrolü: `subscriptionStore` yüklendi → `canCreateProject` doğru değer döndürüyor
