FFmpegService — Kod Analizi & Hata Raporu
ffmpegService.ts · Toplam 7 kritik / 6 uyarı / 4 öneri

Kritik Hatalar
Metod	Seviye	Sorun	Çözüm
exportVideo	Kritik	filterComplex son satırı [v_orig]anull[outa] — bu geçersiz bir FFmpeg filtresi. anull ses filtresi bir ses akışı bekler, ancak burada yanlış çıktı etiketi kullanılmış.	anull yerine acopy veya direkt [v_orig]volume=1[outa] kullan.
exportVideo	Kritik	Music olmadığı durumda [v_orig]anull[outa] bloğu kullanılıyor — ama anull filtresi yoktur, bu null demek değil. FFmpeg bu komutu reddeder.	anull → anull,asetpts=PTS-STARTPTS[outa] değil; [v_orig]acopy[outa] kullan.
exportVideo	Kritik	-map "[v]" ama videoStream son değerine göre [v4], [v5] gibi farklı isimler alır. -map videoStream yerine hardcoded [v] geçiliyor.	-map "[v]" → -map "${videoStream}" yap. Aynı sorun [outa] için de geçerlidir.
removeSilences	Kritik	Sadece ses durumunda -c:v copy yazılmış ama video akışı yok. Bu FFmpeg'in hata vermesine neden olur.	Ses-only durumunda -c:v copy kaldırılmalı; sadece -map "[a]" -c:a aac -y kullanılmalı.
exportVideo	Kritik	Statistics callback null as any ile temizleniyor. Bu TypeScript hack'i runtime'da null gönderir ve bazı FFmpegKit sürümlerinde crash'e neden olur.	enableStatisticsCallback(null as any) → FFmpegKitConfig.disableStatistics() veya boş bir callback kullan.
checkHasAudio / checkHasVideo	Kritik	Her iki metod da -i "path" -hide_banner komutu çalıştırır. FFmpegKit bu komutu her seferinde yeni bir oturum açarak çalıştırır; exportVideo içinde arka arkaya 4 kez çağrılıyor → 4 gereksiz FFmpeg oturumu.	Tek bir probeVideo(path) metodu yaz, {hasAudio, hasVideo, duration} döndürsün.
exportVideo	Kritik	config.videoPath hem getPath ile hem de stripFileProtocol(ensureAbsolute(...)) ile işleniyor ama checkHasAudio(config.videoPath)'a ham path veriliyor — tutarsız path normalization.	Metodun en başında bir kez const rawPath = stripFileProtocol(ensureAbsolute(config.videoPath)) yap ve her yerde bunu kullan.
Uyarılar
Metod	Seviye	Sorun	Öneri
exportVideo	Uyarı	preciseDuration = 999 fallback değeri — gerçek süre bilinmediğinde atama yapılıyor. Bu, yanlış progress hesaplamasına ve afade filtrelerinin hatalı başlangıç zamanına neden olur.	Fallback için daha makul bir değer kullan veya fade-out'u süre bilinemiyorsa devre dışı bırak.
exportVideo	Uyarı	Watermark için /system/fonts/Roboto-Regular.ttf hardcoded. Bu yol Samsung, Xiaomi gibi cihazlarda mevcut olmayabilir.	Font yolunu runtime'da kontrol et; bulunamazsa fontfile parametresini kaldır (FFmpeg sistem fontunu kullanır).
removeSilences	Uyarı	padding parametresi fonksiyon imzasında var ama hiç kullanılmıyor.	Segment başlangıç/bitiş değerlerine padding/1000 ekle veya parametreyi kaldır.
extractAudio	Uyarı	M4A için -acodec copy kullanılıyor — kaynak video AAC dışında bir codec içeriyorsa (örn. Opus, MP3) output bozuk olur.	-acodec copy → -c:a aac -q:a 2 kullan; ek overhead minimal.
generateThumbnail	Uyarı	Video süresi timeSeconds'dan kısaysa FFmpeg hata verir ve thumbnail üretilmez; hata mesajı generic.	Önce getVideoInfo ile süreyi kontrol et veya hata mesajını daha açıklayıcı hale getir.
detectSilences	Uyarı	-f null - komutu non-zero return code döner ve bu beklenen bir durum; ancak allOutput.includes('silencedetect') kontrolü hiç sessizlik tespit edilemediğinde false döner ve gereksiz yere hata fırlatır.	Sessizlik yoksa boş array döndür: if (!allOutput.includes('silencedetect')) return [];
Öneriler
Alan	Seviye	Açıklama
Genel	Öneri	Her metod ensureLogCallback() çağrıyor. Bu singleton pattern ile zaten bir kez çalışıyor ama her metod başında gereksiz await oluşturuyor. Constructor'a taşı.
exportVideo	Öneri	filterComplex string concatenation ile büyüyor. Karmaşık pipeline'larda debug edilmesi zorlaşır. Filter zincirini bir array olarak oluşturup .join('; ') ile birleştir.
Genel	Öneri	Cache dosyaları (extracted_audio_, thumb_, cut_) hiç temizlenmiyor. Uzun süre kullanımda cihaz depolama alanı dolabilir. Bir clearCache() metodu ekle.
exportVideo	Düzeltilmiş	FIX #1, #2, #3 yorumları doğru sorunları işaret ediyor ve uygulanan düzeltmeler mantıklı. getLogs() kullanımı ve ses/video stream kontrolü doğru yaklaşım.


Genel değerlendirme: Kod'un temel mantığı ve stream kontrolü (FIX #1/2/3) doğru kurulmuş, ama birkaç ciddi sorun var.
En acil düzeltilmesi gereken 3 şey:
1. filterComplex etiket tutarsızlığı — videoStream değişkeni [v1], [v2]... diye güncelleniyor ama -map "[v]" hardcoded. Bu komut her zaman hata verir. -map "${videoStream}" olmalı.
2. anull filtresi yok — FFmpeg'de anull diye bir filtre yoktur. anull sanki "ses geçirme/boş bırak" gibi görünse de bu isimde bir filtre mevcut değil. acopy kullanman gerekiyor.
3. Ses-only removeSilences — -c:v copy yazılmış ama video akışı yok. FFmpeg bu satırı görünce hata verir, video stream bulamaz.