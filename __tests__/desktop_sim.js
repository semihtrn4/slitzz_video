const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const videoPath = 'c:\\Users\\User\\Desktop\\blitzz\\pipiads_video_1770589150792.mp4';
const outputPath = 'c:\\Users\\User\\Desktop\\blitzz\\test_desktop_export.mp4';

// 1. Generate Fake Custom ASS Subtitles
const assPath = 'c:\\Users\\User\\Desktop\\blitzz\\__tests__\\test_subtitles.ass';
const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,20,20,100,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,SISTEM VE ALTYAZILAR HATASIZ CALISIYOR!
Dialogue: 0,0:00:05.00,0:00:10.00,Default,,0,0,0,,BLITZZ DESKTOP MOCK TEST BASARILI!
`;
fs.writeFileSync(assPath, assContent);

// 2. Build Filter Complex
const escapedAssPath = assPath.replace(/\\/g, '/').replace(/'/g, "\\'").replace(/:/g, '\\:');
const filterComplex = `[0:v]ass='${escapedAssPath}'[v1];[v1]format=yuv420p[vout]`;

// 3. Write Filter Complex to Script
const scriptPath = 'c:\\Users\\User\\Desktop\\blitzz\\__tests__\\fc_desktop_test.txt';
fs.writeFileSync(scriptPath, filterComplex);

// 4. Run FFmpeg mimicking the mobile parameters
const args = [
  '-y',
  '-i', videoPath,
  '-filter_complex_script', scriptPath,
  '-map', '[vout]',
  '-map', '0:a?', // keep original audio
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-crf', '23',
  '-c:a', 'aac',
  '-b:a', '128k',
  outputPath
];

console.log('\n========================================\n[FFmpeg] Commencing Export Pipeline Simulation\n========================================\n');
console.log('Running Desktop FFmpeg:');
console.log('ffmpeg ' + args.join(' '));

try {
  const output = execSync('ffmpeg ' + args.join(' '), { encoding: 'utf-8', stdio: 'pipe' });
  console.log(output);
  console.log('\n========================================\nEXPORT SUCCESSFUL: ' + outputPath + '\n========================================\n');
} catch (e) {
  console.error('\n========================================\nEXPORT FAILED\n========================================\n');
  console.error('Exit status:', e.status);
  console.error(e.stderr);
}
