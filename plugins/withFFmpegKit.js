const { withAppBuildGradle, withProjectBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Bulletproof Fix for ffmpeg-kit-react-native v6.0 retirement.
 * 1. Downloads the AAR from a mirror using Node.js (before Gradle starts).
 * 2. Patches the node_modules directly to remove the dead Maven dependency.
 */

const AAR_URL = 'https://github.com/NooruddinLakhani/ffmpeg-kit-full-gpl/releases/download/v1.0.0/ffmpeg-kit-full-gpl.aar';

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    // Only download if doesn't exist or is empty
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`[withFFmpegKit] ${path.basename(dest)} already exists and is not empty.`);
      return resolve();
    }
    
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    console.log(`[withFFmpegKit] Downloading AAR from ${url}...`);
    
    const request = (targetUrl) => {
      const protocol = targetUrl.startsWith('https') ? https : require('http');
      protocol.get(targetUrl, (response) => {
        const { statusCode } = response;
        
        // Handle Redirects
        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const redirectUrl = response.headers.location;
          console.log(`[withFFmpegKit] Redirecting to ${redirectUrl}...`);
          return request(new URL(redirectUrl, targetUrl).toString());
        }

        if (statusCode !== 200) {
          return reject(new Error(`Failed to download: Status Code ${statusCode}`));
        }

        const file = fs.createWriteStream(dest);
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          const size = fs.statSync(dest).size;
          if (size === 0) {
            fs.unlinkSync(dest);
            return reject(new Error('Downloaded file is empty (0 bytes).'));
          }
          console.log(`[withFFmpegKit] Download complete (${size} bytes).`);
          resolve();
        });

        file.on('error', (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
    };

    request(url);
  });
};

const patchLibraryGradle = (projectRoot) => {
  const target = path.join(projectRoot, 'node_modules/ffmpeg-kit-react-native/android/build.gradle');
  if (fs.existsSync(target)) {
    let contents = fs.readFileSync(target, 'utf8');
    const searchPattern = /implementation 'com\.arthenica:ffmpeg-kit-' \+ safePackageName\(safeExtGet\('ffmpegKitPackage', 'https'\)\) \+ ':' \+ safePackageVersion\(safeExtGet\('ffmpegKitPackage', 'https'\)\)/g;
    const replacement = "// patched by Expo Plugin\n  implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar')";

    if (contents.includes(searchPattern) || contents.match(searchPattern)) {
      console.log('[withFFmpegKit] Patching library build.gradle...');
      contents = contents.replace(searchPattern, replacement);
      fs.writeFileSync(target, contents);
    }
  }
};

const withFFmpegKit = (config) => {
  // Step 1: Patch project-level build.gradle — add flatDir repo
  config = withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    contents = contents.replace(/\/\/ BEGIN withFFmpegKit[\s\S]*?\/\/ END withFFmpegKit\n?/g, '');

    const patch = `
// BEGIN withFFmpegKit
allprojects {
    repositories {
        flatDir {
            dirs "$rootDir/libs"
        }
    }
}
// END withFFmpegKit
`;
    if (!contents.includes('BEGIN withFFmpegKit')) {
      contents = contents.replace(/ffmpegKitPackage\s*=\s*["'][^"']*["']/g, '// ffmpegKitPackage removed');
      cfg.modResults.contents = contents + patch;
    }
    return cfg;
  });

  // Step 2: Patch app-level build.gradle — add implementation (for safety)
  config = withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    contents = contents.replace(/\/\/ BEGIN withFFmpegKitApp[\s\S]*?\/\/ END withFFmpegKitApp\n?/g, '');

    const patch = `
// BEGIN withFFmpegKitApp
android {
    repositories {
        flatDir {
            dirs "$rootDir/libs"
        }
    }
}
dependencies {
    implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar')
    implementation 'com.arthenica:smart-exception-java:0.2.1'
}
// END withFFmpegKitApp
`;
    if (!contents.includes('BEGIN withFFmpegKitApp')) {
      cfg.modResults.contents = contents + patch;
    }
    return cfg;
  });

  // Step 3: Dangerous Mod to handle file download and node_modules patching (Node level)
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const libsDir = path.join(projectRoot, 'android/libs');
      const aarPath = path.join(libsDir, 'ffmpeg-kit-full-gpl.aar');

      // 1. Patch library directly
      patchLibraryGradle(projectRoot);

      // 2. Download AAR
      try {
        await downloadFile(AAR_URL, aarPath);
      } catch (e) {
        console.error('[withFFmpegKit] Failed to download AAR:', e);
      }

      return cfg;
    },
  ]);

  return config;
};

module.exports = withFFmpegKit;
