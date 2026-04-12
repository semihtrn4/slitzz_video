const config = {
    srtPath: "/data/user/0/com.slitzcut.app/cache/subtitles_1775933249081.ass",
    includeSubtitles: true,
    watermark: true,
    resolution: "1080p",
    aspectRatio: "9:16",
    audioVolume: 100,
    isPremium: false,
    // Gerçekçi test için bunları da ekle:
    hasAudio: true,
    hasVideo: true,
    trimStart: 0,
    trimEnd: null,
    speed: 1,
    musicPath: null,
};

const inputPath = "/data/user/0/com.slitzcut.app/files/projects/project_test.mp4";
const outputPath = "/data/user/0/com.slitzcut.app/files/exports/SlitzCut_final.mp4";

function generateFFmpegCommand() {
    console.log("=== FFmpeg Logic Verification ===");
    const errors = [];
    const warnings = [];
    const fc = [];
    let vStream = "";
    let aStream = "";
    let vIdx = 0;
    let aIdx = 0;

    // --- STEP 1: Scale ---
    fc.push(`[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:0:0,setsar=1[v${vIdx}]`);
    vStream = `[v${vIdx}]`;

    // --- STEP 2: Ses kaynağı ---
    if (config.hasAudio) {
        fc.push(`[0:a]asetpts=PTS-STARTPTS[a${aIdx}]`);
        aStream = `[a${aIdx}]`;
    } else {
        // anullsrc — ses yoksa sessiz stream üret
        fc.push(`anullsrc=channel_layout=stereo:sample_rate=44100:d=60[a${aIdx}]`);
        aStream = `[a${aIdx}]`;
        warnings.push("hasAudio=false → anullsrc kullanılıyor");
    }

    // --- STEP 3: Subtitles ---
    if (config.srtPath && config.includeSubtitles) {
        const isAss = config.srtPath.endsWith('.ass');
        const escaped = config.srtPath
            .replace(/\\/g, '/')
            .replace(/'/g, "\\'")
            .replace(/:/g, '\\:');

        vIdx++;

        if (isAss) {
            fc.push(`${vStream}ass=filename='${escaped}'[v${vIdx}]`);
        } else {
            // SRT → ass filtresi SRT okuyamaz, dönüşüm gerekli!
            errors.push("SRT dosyası ass= filtresiyle kullanılamaz → önce ASS'e çevrilmeli");
            fc.push(`${vStream}ass=filename='${escaped}'[v${vIdx}]`); // yine de göster
        }
        vStream = `[v${vIdx}]`;
    }

    // --- STEP 4: Watermark ---
    if (!config.isPremium && config.watermark) {
        vIdx++;
        const watermarkText = 'Made_with_SlitzCut';
        // Boşluk kontrolü
        if (watermarkText.includes(' ')) {
            errors.push("Watermark text boşluk içeriyor → FFmpeg argüman hatası riski!");
        }
        fc.push(`${vStream}drawtext=text='${watermarkText}':x=w-tw-20:y=h-th-20:fontsize=24:fontcolor=white@0.6[v${vIdx}]`);
        vStream = `[v${vIdx}]`;
    }

    // --- STEP 5: Audio volume → outa ---
    const volVal = Math.max(0, Math.min(2, (config.audioVolume ?? 100) / 100)).toFixed(4);
    fc.push(`${aStream}volume=${volVal}[outa]`);

    // --- ASSEMBLY ---
    const filterComplex = fc.join(';');
    const args = [
        "-i", inputPath,
        "-filter_complex", filterComplex,
        "-map", vStream,
        "-map", "[outa]",
        "-c:v", "mpeg4",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-y", outputPath
    ];

    // --- RAPOR ---
    console.log("\n[1] Filter Complex Adımları:");
    fc.forEach((step, i) => console.log(`  fc[${i}]: ${step}`));

    console.log("\n[2] Tam Komut:");
    console.log("ffmpeg " + args.join(" "));

    console.log("\n[3] DOĞRULAMA RAPORU:");

    // Subtitle kontrolü — doğru filter adı kontrol et
    const subOk = filterComplex.includes("ass=filename=");
    console.log(subOk
        ? "✅ Altyazı: ass=filename= kullanılıyor (doğru)"
        : "❌ Altyazı: ass=filename= bulunamadı");

    // Preset kontrolü
    const presetPresent = args.includes("-preset");
    console.log(!presetPresent
        ? "✅ -preset YOK (crash riski yok)"
        : "❌ -preset VAR → crash riski!");

    // Stream kapanışı kontrolü
    const lastFc = fc[fc.length - 1];
    const outerStreamsClosed = lastFc.includes("[outa]") || lastFc.includes("[vout]");
    console.log(outerStreamsClosed
        ? "✅ Output stream'ler kapalı"
        : "❌ Açık stream var → FFmpeg hata verir");

    // vStream map kontrolü
    const vMapped = args.includes(vStream);
    console.log(vMapped
        ? `✅ vStream '${vStream}' map'leniyor`
        : `❌ vStream '${vStream}' args içinde YOK`);

    // Hata / uyarı özeti
    if (errors.length > 0) {
        console.log("\n🔴 HATALAR:");
        errors.forEach(e => console.log("  ❌", e));
    }
    if (warnings.length > 0) {
        console.log("\n🟡 UYARILAR:");
        warnings.forEach(w => console.log("  ⚠️", w));
    }
    if (errors.length === 0 && warnings.length === 0) {
        console.log("\n🟢 Tüm kontroller geçti!");
    }
}

generateFFmpegCommand();