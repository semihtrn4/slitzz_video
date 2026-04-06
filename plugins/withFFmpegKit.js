const { withAppBuildGradle, withProjectBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const https = require('https');

const AAR_URL = 'https://github.com/NooruddinLakhani/ffmpeg-kit-full-gpl/releases/download/v1.0.0/ffmpeg-kit-full-gpl.aar';
const AAR_FALLBACK_URL = 'https://github.com/arthenica/ffmpeg-kit/releases/download/v6.0/ffmpeg-kit-full-gpl-6.0-android.aar';

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000000) {
      console.log(`[withFFmpegKit] AAR already cached (${fs.statSync(dest).size} bytes).`);
      return resolve();
    }

    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    console.log(`[withFFmpegKit] Downloading AAR from ${url}...`);

    const request = (targetUrl, redirectCount = 0) => {
      if (redirectCount > 10) return reject(new Error('Too many redirects'));
      const isHttps = targetUrl.startsWith('https');
      const protocol = isHttps ? https : require('http');

      protocol.get(targetUrl, (response) => {
        const { statusCode } = response;

        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const redirectUrl = response.headers.location;
          console.log(`[withFFmpegKit] Redirect -> ${redirectUrl}`);
          response.resume();
          return request(new URL(redirectUrl, targetUrl).toString(), redirectCount + 1);
        }

        if (statusCode !== 200) {
          response.resume();
          return reject(new Error(`HTTP ${statusCode}`));
        }

        const file = fs.createWriteStream(dest);
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          const size = fs.statSync(dest).size;
          if (size < 1000000) {
            fs.unlinkSync(dest);
            return reject(new Error(`AAR too small: ${size} bytes`));
          }
          console.log(`[withFFmpegKit] Download complete: ${size} bytes`);
          resolve();
        });
        file.on('error', (err) => {
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
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
  if (!fs.existsSync(target)) return;

  let contents = fs.readFileSync(target, 'utf8');
  // Remove retired maven dependency
  const searchPattern = /implementation 'com\.arthenica:ffmpeg-kit-[^']+'/g;
  if (contents.match(searchPattern)) {
    console.log('[withFFmpegKit] Patching ffmpeg-kit build.gradle...');
    contents = contents.replace(searchPattern, "// retired dep removed by plugin\n  implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar')");
    fs.writeFileSync(target, contents);
  }
};

const withFFmpegKit = (config) => {
  // Step 1: project-level build.gradle — flatDir repo
  config = withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    contents = contents.replace(/\/\/ BEGIN withFFmpegKit[\s\S]*?\/\/ END withFFmpegKit\n?/g, '');

    if (!contents.includes('BEGIN withFFmpegKit')) {
      contents = contents.replace(/ffmpegKitPackage\s*=\s*["'][^"']*["']/g, '// ffmpegKitPackage removed');
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

  // Step 2: app-level build.gradle
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
dependencies {
    implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar')
    implementation 'com.arthenica:smart-exception-java:0.2.1'
}
// END withFFmpegKitApp
`;
    }
    return cfg;
  });

  // Step 3: Download AAR + patch node_modules
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const libsDir = path.join(projectRoot, 'android/libs');
      const aarPath = path.join(libsDir, 'ffmpeg-kit-full-gpl.aar');

      patchLibraryGradle(projectRoot);

      try {
        await downloadFile(AAR_URL, aarPath);
      } catch (e) {
        console.warn('[withFFmpegKit] Primary URL failed, trying fallback:', e.message);
        try {
          await downloadFile(AAR_FALLBACK_URL, aarPath);
        } catch (e2) {
          console.error('[withFFmpegKit] Both URLs failed. Build may fail:', e2.message);
        }
      }

      return cfg;
    },
  ]);

  return config;
};

module.exports = withFFmpegKit;
