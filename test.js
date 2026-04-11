/**
 * FFmpeg Mantık Doğrulayıcı (Node.js)
 * Çalıştırmak için: node ffmpeg_validator.js
 */

const RES_MAP = {
    "1080p": { w: 1080, h: 1920 },
    "720p": { w: 720, h: 1280 },
    "480p": { w: 480, h: 854 },
};

// ─── SENARYOLAR ────────────────────────────────────────────────────────────────
const SCENARIOS = [
    {
        name: "1) Temel (ASS + Watermark)",
        inputPath: "/data/user/0/com.slitzcut.app/files/projects/project_test.mp4",
        outputPath: "/data/user/0/com.slitzcut.app/files/exports/SlitzCut_final.mp4",
        config: {
            srtPath: "/data/user/0/com.slitzcut.app/cache/subtitles_123.ass",
            includeSubtitles: true,
            watermark: true,
            isPremium: false,
            resolution: "1080p",
        },
    },
    {
        name: "2) Premium Kullanıcı (watermark olmamalı)",
        inputPath: "/data/user/0/com.slitzcut.app/files/projects/project_test.mp4",
        outputPath: "/data/user/0/com.slitzcut.app/files/exports/SlitzCut_final.mp4",
        config: {
            srtPath: "/data/user/0/com.slitzcut.app/cache/subtitles_123.ass",
            includeSubtitles: true,
            watermark: true,   // isPremium=true olunca bu görmezden gelinmeli
            isPremium: true,
            resolution: "1080p",
        },
    },
    {
        name: "3) SRT Altyazı",
        inputPath: "/data/user/0/com.slitzcut.app/files/projects/project_test.mp4",
        outputPath: "/data/user/0/com.slitzcut.app/files/exports/SlitzCut_final.mp4",
        config: {
            srtPath: "/data/user/0/com.slitzcut.app/cache/subtitles_123.srt",
            includeSubtitles: true,
            watermark: true,
            isPremium: false,
            resolution: "720p",
        },
    },
    {
        name: "4) Altyazısız",
        inputPath: "/data/user/0/com.slitzcut.app/files/projects/project_test.mp4",
        outputPath: "/data/user/0/com.slitzcut.app/files/exports/SlitzCut_final.mp4",
        config: {
            srtPath: null,
            includeSubtitles: false,
            watermark: true,
            isPremium: false,
            resolution: "1080p",
        },
    },
    {
        name: "5) Özel Karakter Path (kesme işareti ve iki nokta)",
        inputPath: "/data/user/0/com.slitzcut.app/files/projects/project_test.mp4",
        outputPath: "/data/user/0/com.slitzcut.app/files/exports/SlitzCut_final.mp4",
        config: {
            srtPath: "/data/user/0/cache/sub'file:test.ass",
            includeSubtitles: true,
            watermark: false,
            isPremium: false,
            resolution: "1080p",
        },
    },
    {
        name: "6) Windows Tarzı Path (backslash)",
        inputPath: "/data/user/0/com.slitzcut.app/files/projects/project_test.mp4",
        outputPath: "/data/user/0/com.slitzcut.app/files/exports/SlitzCut_final.mp4",
        config: {
            srtPath: "C:\\Users\\Test\\sub'file:test.ass",
            includeSubtitles: true,
            watermark: true,
            isPremium: false,
            resolution: "1080p",
        },
    },
];

// ─── KOMUT ÜRETICI ─────────────────────────────────────────────────────────────
function generateCommand(inputPath, outputPath, cfg) {
    const dim = RES_MAP[cfg.resolution] || { w: 1080, h: 1920 };
    const fc = [];
    let vIdx = 0;
    let vStream = "[0:v]";

    // STEP 1: Scale + Pad
    fc.push(
        `[0:v]scale=${dim.w}:${dim.h}:force_original_aspect_ratio=decrease,` +
        `pad=${dim.w}:${dim.h}:0:0,setsar=1[v${vIdx}]`
    );
    vStream = `[v${vIdx}]`;

    // STEP 2: Altyazı
    if (cfg.srtPath && cfg.includeSubtitles) {
        vIdx++;
        const isAss = cfg.srtPath.endsWith(".ass");
        const escaped = cfg.srtPath
            .replace(/\\/g, "/")
            .replace(/'/g, "\\'")
            .replace(/:/g, "\\:");

        if (isAss) {
            fc.push(`${vStream}subtitles=filename='${escaped}'[v${vIdx}]`);
        } else {
            fc.push(`${vStream}subtitles=filename='${escaped}':force_style='FontSize=48'[v${vIdx}]`);
        }
        vStream = `[v${vIdx}]`;
    }

    // STEP 3: Watermark (sadece premium DEĞİLSE)
    if (!cfg.isPremium && cfg.watermark) {
        vIdx++;
        fc.push(
            `${vStream}drawtext=text='Made_with_SlitzCut':` +
            `x=w-tw-20:y=h-th-20:fontsize=24:fontcolor=white@0.6[v${vIdx}]`
        );
        vStream = `[v${vIdx}]`;
    }

    // STEP 4: Audio
    fc.push(`[0:a]volume=1.0000[outa]`);

    const filterComplex = fc.join(";");

    const args = [
        "-i", inputPath,
        "-filter_complex", `"${filterComplex}"`,
        "-map", vStream,
        "-map", "[outa]",
        "-c:v", "libx264",
        // NOT: -preset kasıtlı olarak kaldırıldı (Android crash önlemi)
        "-y", outputPath,
    ];

    return { filterComplex, args, vStream, vIdx };
}

// ─── DOĞRULAMA KONTROLLERI ─────────────────────────────────────────────────────
function validateResult(inputPath, cfg, result) {
    const { filterComplex, args, vStream, vIdx } = result;
    const checks = [];

    // 1. filename= formatı
    if (cfg.srtPath && cfg.includeSubtitles) {
        const ok = filterComplex.includes("subtitles=filename=");
        checks.push({
            label: "Altyazı formatı",
            pass: ok,
            msg: ok
                ? "filename= formatı kullanılıyor (güvenli)"
                : "ESKİ format — Android'de crash riski var!",
        });

        // 2. SRT için force_style
        if (!cfg.srtPath.endsWith(".ass")) {
            const ok2 = filterComplex.includes("force_style=");
            checks.push({
                label: "SRT force_style",
                pass: ok2,
                msg: ok2 ? "force_style eklendi" : "SRT için force_style EKSİK",
            });
        }

        // 3. Özel karakter uyarıları
        if (cfg.srtPath.includes("'")) {
            checks.push({
                label: "UYARI: Path'de kesme işareti",
                pass: "warn",
                msg: "Escape edildi ama Android'de sorun çıkarabilir",
            });
        }
        if (cfg.srtPath.includes(":")) {
            checks.push({
                label: "UYARI: Path'de iki nokta",
                pass: "warn",
                msg: "Escape edildi (:) → (\\:)",
            });
        }
        if (cfg.srtPath.includes("\\")) {
            checks.push({
                label: "UYARI: Backslash tespit edildi",
                pass: "warn",
                msg: "/ ile değiştirildi — Android path'i kontrol et",
            });
        }
        if (!cfg.srtPath.startsWith("/") && !cfg.srtPath.match(/^[A-Z]:\\/)) {
            checks.push({
                label: "Altyazı path",
                pass: false,
                msg: "Path mutlak değil! Relatif path Android'de çalışmaz",
            });
        }
    } else {
        checks.push({ label: "Altyazı", pass: true, msg: "Devre dışı — atlandı" });
    }

    // 4. -preset kontrolü
    const hasPreset = args.includes("-preset");
    checks.push({
        label: "-preset",
        pass: !hasPreset,
        msg: !hasPreset
            ? "-preset yok (Android crash önlendi)"
            : "-preset HALA VAR — crash riski!",
    });

    // 5. Watermark mantığı
    const hasWm = filterComplex.includes("drawtext=");
    const shouldWm = !cfg.isPremium && cfg.watermark;
    checks.push({
        label: "Watermark mantığı",
        pass: hasWm === shouldWm,
        msg:
            shouldWm && hasWm ? "Watermark doğru eklendi" :
                !shouldWm && !hasWm ? "Premium/kapalı — watermark yok (DOĞRU)" :
                    shouldWm && !hasWm ? "Watermark olmalıydı ama EKSİK!" :
                        "Premium'a rağmen watermark var — HATA!",
    });

    // 6. Scale/pad/setsar
    const scaleOk =
        filterComplex.includes("force_original_aspect_ratio=decrease") &&
        filterComplex.includes("setsar=1");
    checks.push({
        label: "Scale/pad/setsar",
        pass: scaleOk,
        msg: scaleOk ? "Doğru" : "scale veya setsar=1 EKSİK",
    });

    // 7. Stream map zinciri
    const lastV = `[v${vIdx}]`;
    const mapOk = args.includes(lastV);
    checks.push({
        label: "Stream map zinciri",
        pass: mapOk,
        msg: mapOk
            ? `Son video stream doğru map'lendi: ${lastV}`
            : `Map hatası — ${lastV} bulunamadı`,
    });

    // 8. Audio map
    const audioOk =
        filterComplex.includes("[0:a]volume=") &&
        filterComplex.includes("[outa]") &&
        args.includes("[outa]");
    checks.push({
        label: "Audio map",
        pass: audioOk,
        msg: audioOk ? "Audio zinciri doğru" : "Audio map zinciri KIRIK",
    });

    // 9. Input path
    if (!inputPath.startsWith("/")) {
        checks.push({
            label: "Input path",
            pass: false,
            msg: "Input path mutlak değil!",
        });
    }

    return checks;
}

// ─── RAPORLAYICI ───────────────────────────────────────────────────────────────
function printReport(scenario, result, checks) {
    const sep = "─".repeat(60);
    console.log(`\n${sep}`);
    console.log(`SENARYO: ${scenario.name}`);
    console.log(sep);

    const pass = checks.filter(c => c.pass === true).length;
    const fail = checks.filter(c => c.pass === false).length;
    const warn = checks.filter(c => c.pass === "warn").length;

    console.log(`Özet: ✅ ${pass} geçti  ❌ ${fail} hata  ⚠️  ${warn} uyarı\n`);

    checks.forEach(c => {
        const icon = c.pass === true ? "✅" : c.pass === "warn" ? "⚠️ " : "❌";
        console.log(`  ${icon} [${c.label}] ${c.msg}`);
    });

    console.log("\n  [Filter Complex]");
    result.filterComplex.split(";").forEach(f => console.log("    " + f));

    console.log("\n  [Tam Komut]");
    console.log("  ffmpeg " + result.args.join(" "));

    return fail;
}

// ─── ANA ÇALIŞMA ───────────────────────────────────────────────────────────────
let totalFail = 0;

SCENARIOS.forEach(scenario => {
    const result = generateCommand(
        scenario.inputPath,
        scenario.outputPath,
        scenario.config
    );
    const checks = validateResult(scenario.inputPath, scenario.config, result);
    totalFail += printReport(scenario, result, checks);
});

console.log("\n" + "═".repeat(60));
if (totalFail === 0) {
    console.log("✅ TÜM SENARYOLAR GEÇTİ — Komutlar Android'e gönderilebilir.");
} else {
    console.log(`❌ ${totalFail} HATA BULUNDU — Yukarıdaki hataları düzelt.`);
}
console.log("═".repeat(60) + "\n");