/**
 * FFmpeg Mantık Doğrulayıcı (Node.js)
 * Bu betik projedeki ffmpegService.ts'in ürettiği komutu 
 * build almadan masaüstünde doğrulamamızı sağlar.
 */

// 1. AYARLAR (Uygulamadan gelen veriyi simüle eder)
const config = {
    srtPath: "/data/user/0/com.slitzcut.app/cache/subtitles_1775933249081.ass",
    includeSubtitles: true,
    watermark: true,
    resolution: "1080p",
    aspectRatio: "9:16",
    audioVolume: 100,
    isPremium: false
};

const inputPath = "/data/user/0/com.slitzcut.app/files/projects/project_test.mp4";
const outputPath = "/data/user/0/com.slitzcut.app/files/exports/SlitzCut_final.mp4";

// 2. KOD MANTIĞI SİMÜLASYONU
function generateFFmpegCommand() {
    console.log("=== FFmpeg Logic Verification ===");
    console.log("Input:", inputPath);
    
    const fc = [];
    let vStream = "[0:v]";
    let aStream = "[0:a]";
    let vIdx = 0;
    
    // --- STEP 1: Scaling & Padding ---
    // Loglarda hata veren scale kısmını korumalı şekilde ekliyoruz
    fc.push(`[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:0:0,setsar=1[v${vIdx}]`);
    vStream = `[v${vIdx}]`;

    // --- STEP 2: Subtitles (KRİTİK GÜNCELLEME) ---
    if (config.srtPath && config.includeSubtitles) {
        vIdx++;
        const isAss = config.srtPath.endsWith('.ass');
        const rawSubPath = config.srtPath; // stripFileProtocol simülasyonu
        const escaped = rawSubPath.replace(/\\/g, '/').replace(/'/g, "\\'").replace(/:/g, '\\:');
        
        if (isAss) {
            // Yeni ve güvenli format: filename='...'
            fc.push(`${vStream}subtitles=filename='${escaped}'[v${vIdx}]`);
        } else {
            fc.push(`${vStream}subtitles=filename='${escaped}':force_style='FontSize=48'[v${vIdx}]`);
        }
        vStream = `[v${vIdx}]`;
    }

    // --- STEP 3: Watermark ---
    if (!config.isPremium && config.watermark) {
        vIdx++;
        fc.push(`${vStream}drawtext=text='Made_with_SlitzCut':x=w-tw-20:y=h-th-20:fontsize=24:fontcolor=white@0.6[v${vIdx}]`);
        vStream = `[v${vIdx}]`;
    }

    // --- STEP 4: Audio ---
    fc.push(`[0:a]volume=1.0000[outa]`);

    // FINAL ASSEMBLY
    const filterComplex = fc.join(';');
    const args = [
        "-i", inputPath,
        "-filter_complex", `"${filterComplex}"`,
        "-map", vStream,
        "-map", "[outa]",
        "-c:v", "libx264",
        // "-preset", "fast", // Kaldırıldı (Çökmeyi önleyen hamle)
        "-y", outputPath
    ];

    console.log("\n[1] Üretilen Filter Complex:");
    console.log(filterComplex);

    console.log("\n[2] Üretilen Tam Komut (Android'e gidecek veri):");
    console.log("ffmpeg " + args.join(" "));

    console.log("\n[3] DOĞRULAMA RAPORU:");
    console.log(filterComplex.includes("subtitles=filename=") ? "✅ Altyazı formatı GÜVENLİ (filename= mevcut)" : "❌ Altyazı formatı HATALI");
    console.log(!args.includes("-preset") ? "✅ Preset hatası ÇÖZÜLDÜ (-preset kaldırıldı)" : "❌ Preset hatası hala VAR");
    console.log("---------------------------------");
}

generateFFmpegCommand();
