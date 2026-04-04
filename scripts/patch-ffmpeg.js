const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../node_modules/ffmpeg-kit-react-native/android/build.gradle');

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, 'utf8');
  
  // Patch to remove the dead arthenica dependency and use the local AAR instead
  const searchPattern = /implementation 'com\.arthenica:ffmpeg-kit-' \+ safePackageName\(safeExtGet\('ffmpegKitPackage', 'https'\)\) \+ ':' \+ safePackageVersion\(safeExtGet\('ffmpegKitPackage', 'https'\)\)/g;
  const replacement = "// patched to remove dead arthenica dependency\n  implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar')";

  if (content.match(searchPattern)) {
    console.log('Patching ffmpeg-kit-react-native build.gradle...');
    const newContent = content.replace(searchPattern, replacement);
    fs.writeFileSync(targetFile, newContent);
    console.log('Successfully patched.');
  } else if (content.includes("ffmpeg-kit-full-gpl")) {
    console.log('ffmpeg-kit-react-native already patched.');
  } else {
    console.warn('Could not find the dependency line in build.gradle. Already changed?');
  }
} else {
  console.error('Target file not found: ' + targetFile);
}
