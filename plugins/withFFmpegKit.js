const { withAppBuildGradle, withProjectBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const https = require('https');

const AAR_URL = 'https://github.com/NooruddinLakhani/ffmpeg-kit-full-gpl/releases/download/v1.0.0/ffmpeg-kit-full-gpl.aar';

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000000) {
      console.log(`[withFFmpegKit] AAR already cached (${fs.statSync(dest).size} bytes).`);
      return resolve();
    }
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    console.log(`[withFFmpegKit] Downloading AAR...`);

    const request = (targetUrl, hops = 0) => {
      if (hops > 10) return reject(new Error('Too many redirects'));
      const mod = targetUrl.startsWith('https') ? https : require('http');
      mod.get(targetUrl, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          return request(new URL(res.headers.location, targetUrl).toString(), hops + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          const size = fs.statSync(dest).size;
          if (size < 1000000) { fs.unlinkSync(dest); return reject(new Error(`Too small: ${size}`)); }
          console.log(`[withFFmpegKit] Downloaded ${size} bytes`);
          resolve();
        });
        file.on('error', (e) => { if (fs.existsSync(dest)) fs.unlinkSync(dest); reject(e); });
      }).on('error', (e) => { if (fs.existsSync(dest)) fs.unlinkSync(dest); reject(e); });
    };
    request(url);
  });
};

/**
 * Directly rewrites the ffmpeg-kit-react-native build.gradle dependencies block.
 * The original line uses string concatenation which can't be matched with a simple regex.
 * We replace the entire dependencies block.
 */
const patchLibraryGradle = (projectRoot) => {
  const target = path.join(
    projectRoot,
    'node_modules/ffmpeg-kit-react-native/android/build.gradle'
  );
  if (!fs.existsSync(target)) {
    console.warn('[withFFmpegKit] build.gradle not found:', target);
    return;
  }

  let contents = fs.readFileSync(target, 'utf8');

  // Check if already patched
  if (contents.includes('ffmpeg-kit-full-gpl')) {
    console.log('[withFFmpegKit] build.gradle already patched, skipping.');
    return;
  }

  // Replace the entire dependencies block
  // Original:
  //   dependencies {
  //     api 'com.facebook.react:react-native:+'
  //     implementation 'com.arthenica:ffmpeg-kit-' + safePackageName(...) + ':' + safePackageVersion(...)
  //   }
  const originalDepsBlock = /dependencies\s*\{[^}]*com\.arthenica:ffmpeg-kit[^}]*\}/s;

  const newDepsBlock = `dependencies {
  api 'com.facebook.react:react-native:+'
  // ffmpeg-kit retired from Maven — using local AAR instead
  implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar')
  implementation 'com.arthenica:smart-exception-java:0.2.1'
}`;

  if (originalDepsBlock.test(contents)) {
    contents = contents.replace(originalDepsBlock, newDepsBlock);
    fs.writeFileSync(target, contents);
    console.log('[withFFmpegKit] Successfully patched build.gradle dependencies block.');
  } else {
    // Fallback: append override at end of file
    console.warn('[withFFmpegKit] Could not find dependencies block, appending override...');
    contents += `\n\n// ffmpeg-kit patch\nconfigurations.all {\n  resolutionStrategy {\n    force 'com.arthenica:smart-exception-java:0.2.1'\n  }\n}\n`;
    // Also try line-by-line replacement
    const lines = contents.split('\n');
    const patched = lines.map(line => {
      if (line.includes("implementation 'com.arthenica:ffmpeg-kit-") ||
          line.includes('implementation \'com.arthenica:ffmpeg-kit-') ||
          (line.includes('com.arthenica') && line.includes('ffmpeg-kit'))) {
        return "  implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar') // patched";
      }
      return line;
    });
    fs.writeFileSync(target, patched.join('\n'));
    console.log('[withFFmpegKit] Applied line-by-line patch.');
  }
};

const withFFmpegKit = (config) => {
  // Step 1: project-level build.gradle — add flatDir repo
  config = withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    contents = contents.replace(/\/\/ BEGIN withFFmpegKit[\s\S]*?\/\/ END withFFmpegKit\n?/g, '');
    if (!contents.includes('BEGIN withFFmpegKit')) {
      cfg.modResults.contents = contents + `
// BEGIN withFFmpegKit
allprojects {
    repositories {
        flatDir { dirs "$rootDir/libs" }
    }
}
// END withFFmpegKit
`;
    }
    return cfg;
  });

  // Step 2: app-level build.gradle — add flatDir + explicit dep
  config = withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    contents = contents.replace(/\/\/ BEGIN withFFmpegKitApp[\s\S]*?\/\/ END withFFmpegKitApp\n?/g, '');
    if (!contents.includes('BEGIN withFFmpegKitApp')) {
      cfg.modResults.contents = contents + `
// BEGIN withFFmpegKitApp
android {
    repositories {
        flatDir { dirs "$rootDir/libs" }
    }
}
// END withFFmpegKitApp
`;
    }
    return cfg;
  });

  // Step 3: Download AAR + patch node_modules build.gradle
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const libsDir = path.join(projectRoot, 'android/libs');
      const aarPath = path.join(libsDir, 'ffmpeg-kit-full-gpl.aar');

      // CRITICAL: patch the library build.gradle BEFORE Gradle runs
      patchLibraryGradle(projectRoot);

      // Download AAR
      try {
        await downloadFile(AAR_URL, aarPath);
      } catch (e) {
        console.error('[withFFmpegKit] AAR download failed:', e.message);
        // Don't throw — let Gradle fail with a clear message
      }

      return cfg;
    },
  ]);

  return config;
};

module.exports = withFFmpegKit;
