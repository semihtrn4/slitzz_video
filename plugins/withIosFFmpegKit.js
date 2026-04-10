const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Fix for ffmpeg-kit-react-native v6.0 retirement on iOS.
 *
 * Strategy:
 *  1. Write jdarshan5's ffmpeg-kit-full-gpl.podspec into the ios/ folder.
 *     This podspec downloads the real XCFrameworks (67MB ZIP) from a live
 *     GitHub release — verified working as of April 2025.
 *  2. Patch Podfile to:
 *     a) Load ffmpeg-kit-full-gpl from the local podspec (no dead URLs).
 *     b) Load ffmpeg-kit-react-native from node_modules podspec directly,
 *        with full-gpl subspec so it links against the correct frameworks.
 *
 * Why not NooruddinLakhani mirrors?
 *   All 5 podspec URLs from that repo are dead (404). Verified April 2025.
 *
 * Why jdarshan5?
 *   - ZIP URL alive: https://github.com/jdarshan5/ffmpeg-kit-react-native/
 *     releases/download/rn-binaries/ffmpeg-full-gpl-6-0-2.zip (67MB)
 *   - iOS deployment target: 13.0+
 *   - FFmpeg v6.0 — matches kroog-ffmpeg-kit-react-native on Android
 */
const withIosFFmpegKit = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const podfilePath = path.join(platformRoot, 'Podfile');

      if (!fs.existsSync(podfilePath)) {
        return cfg;
      }

      // ── STEP 1: Write jdarshan5 podspec into ios/ folder ──────────────────
      // CocoaPods will pick this up as a local podspec.
      const podspecContent = `require "json"

Pod::Spec.new do |s|
  s.name         = 'ffmpeg-kit-full-gpl'
  s.version      = '6.0.2'
  s.summary      = 'FFmpeg Kit full-gpl for iOS (jdarshan5 mirror)'
  s.homepage     = 'https://github.com/jdarshan5/ffmpeg-kit-react-native'
  s.license      = 'LGPL-3.0'
  s.authors      = { 'jdarshan5' => 'open-source@arthenica.com' }

  s.platform                  = :ios, '13.0'
  s.ios.deployment_target     = '13.0'
  s.requires_arc              = true
  s.static_framework          = true

  # Live ZIP — verified 2025-04-08, 67MB, contains all XCFrameworks
  s.source = { :http => 'https://github.com/jdarshan5/ffmpeg-kit-react-native/releases/download/rn-binaries/ffmpeg-full-gpl-6-0-2.zip' }

  s.libraries = ['z', 'bz2', 'c++', 'iconv']
  s.frameworks = ['AudioToolbox', 'AVFoundation', 'CoreMedia', 'VideoToolbox']

  s.vendored_frameworks = [
    'ffmpegkit.xcframework',
    'libavcodec.xcframework',
    'libavdevice.xcframework',
    'libavfilter.xcframework',
    'libavformat.xcframework',
    'libavutil.xcframework',
    'libswresample.xcframework',
    'libswscale.xcframework',
  ]
end
`;

      const localPodspecPath = path.join(platformRoot, 'ffmpeg-kit-full-gpl.podspec');
      fs.writeFileSync(localPodspecPath, podspecContent, 'utf8');
      console.log('[withIosFFmpegKit] Wrote ffmpeg-kit-full-gpl.podspec to ios/');

      // ── STEP 2: Patch Podfile ──────────────────────────────────────────────
      let podfileContents = fs.readFileSync(podfilePath, 'utf8');

      // Remove old patch if present
      podfileContents = podfileContents.replace(
        /# BEGIN withIosFFmpegKit[\s\S]*?# END withIosFFmpegKit\n?/g,
        ''
      );

      const patch = `
# BEGIN withIosFFmpegKit
# ffmpeg-kit-full-gpl: load from local podspec (jdarshan5 mirror, live ZIP)
pod 'ffmpeg-kit-full-gpl', :podspec => './ffmpeg-kit-full-gpl.podspec'

# ffmpeg-kit-react-native: load from node_modules with full-gpl subspec
# Must be defined BEFORE use_native_modules! to avoid duplicate source error
pod 'ffmpeg-kit-react-native', :subspecs => ['full-gpl'], :podspec => '../node_modules/ffmpeg-kit-react-native/ffmpeg-kit-react-native.podspec'
# END withIosFFmpegKit
`;

      // Insert BEFORE use_native_modules! so CocoaPods sees it first
      if (podfileContents.includes('use_native_modules!')) {
        podfileContents = podfileContents.replace(
          'use_native_modules!',
          `${patch}\n  use_native_modules!`
        );
      } else if (podfileContents.includes('use_expo_modules!')) {
        podfileContents = podfileContents.replace(
          'use_expo_modules!',
          `use_expo_modules!\n${patch}`
        );
      } else {
        podfileContents += `\n${patch}`;
      }

      fs.writeFileSync(podfilePath, podfileContents, 'utf8');
      console.log('[withIosFFmpegKit] Patched Podfile with jdarshan5 ffmpeg-kit-full-gpl');

      return cfg;
    },
  ]);
};

module.exports = withIosFFmpegKit;
