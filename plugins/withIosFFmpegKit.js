const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Fix for ffmpeg-kit-react-native v6.0 retirement on iOS.
 * Re-routes the dead CocoaPods dependencies to a community-maintained mirror.
 */
const withIosFFmpegKit = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      if (!fs.existsSync(podfilePath)) {
        return config;
      }

      let podfileContents = fs.readFileSync(podfilePath, 'utf8');

      // Add the mirror repositories to the top of Podfile or as a block
      const patch = `
# BEGIN withIosFFmpegKit
# Route retired FFmpegKit pods to community mirrors
pod 'ffmpeg-kit-ios-https', :podspec => 'https://raw.githubusercontent.com/NooruddinLakhani/ffmpeg-kit-ios-https/main/ffmpeg-kit-ios-https.podspec'
pod 'ffmpeg-kit-ios-full-gpl', :podspec => 'https://raw.githubusercontent.com/NooruddinLakhani/ffmpeg-kit-ios-full-gpl/main/ffmpeg-kit-ios-full-gpl.podspec'
pod 'ffmpeg-kit-ios-audio', :podspec => 'https://raw.githubusercontent.com/NooruddinLakhani/ffmpeg-kit-ios-audio/main/ffmpeg-kit-ios-audio.podspec'
pod 'ffmpeg-kit-ios-video', :podspec => 'https://raw.githubusercontent.com/NooruddinLakhani/ffmpeg-kit-ios-video/main/ffmpeg-kit-ios-video.podspec'
pod 'ffmpeg-kit-ios-min', :podspec => 'https://raw.githubusercontent.com/NooruddinLakhani/ffmpeg-kit-ios-min/main/ffmpeg-kit-ios-min.podspec'
# END withIosFFmpegKit
`;

      if (!podfileContents.includes('BEGIN withIosFFmpegKit')) {
        // Appending right after 'use_expo_modules!'
        podfileContents = podfileContents.replace(
          /use_expo_modules!/g,
          `use_expo_modules!\n${patch}`
        );

        // Fallback if patch wasn't applied
        if (!podfileContents.includes('BEGIN withIosFFmpegKit')) {
          podfileContents += `\n${patch}`;
        }
        
        fs.writeFileSync(podfilePath, podfileContents);
      }

      return config;
    },
  ]);
};

module.exports = withIosFFmpegKit;
