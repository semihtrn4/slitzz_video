const { withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Fix for ffmpeg-kit-react-native v6.0 retirement.
 * The official Maven artifacts were removed in January 2025.
 * This plugin downloads the AAR from a self-hosted mirror and uses it locally.
 * Source: https://medium.com/@nooruddinlakhani/resolved-ffmpegkit-retirement-issue-in-react-native-a-complete-guide-0f54b113b390
 */
const withFFmpegKit = (config) => {
  // Step 1: Patch project-level build.gradle — add flatDir repo
  config = withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // Remove previously added blocks
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
      // Remove ffmpegKitPackage from ext block to prevent original dependency resolution
      contents = contents.replace(/ffmpegKitPackage\s*=\s*["'][^"']*["']/g, '// ffmpegKitPackage removed');
      cfg.modResults.contents = contents + patch;
    }
    return cfg;
  });

  // Step 2: Patch app-level build.gradle — download AAR and use it
  config = withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // Remove previously added blocks
    contents = contents.replace(/\/\/ BEGIN withFFmpegKitApp[\s\S]*?\/\/ END withFFmpegKitApp\n?/g, '');

    const patch = `
// BEGIN withFFmpegKitApp
import java.net.URL

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

afterEvaluate {
    def aarUrl = 'https://github.com/NooruddinLakhani/ffmpeg-kit-full-gpl/releases/download/v1.0.0/ffmpeg-kit-full-gpl.aar'
    def aarFile = file("\${rootDir}/libs/ffmpeg-kit-full-gpl.aar")

    tasks.register("downloadFFmpegKitAar") {
        doLast {
            if (!aarFile.parentFile.exists()) {
                aarFile.parentFile.mkdirs()
            }
            if (!aarFile.exists()) {
                println "Downloading ffmpeg-kit AAR..."
                new URL(aarUrl).withInputStream { i ->
                    aarFile.withOutputStream { it << i }
                }
                println "ffmpeg-kit AAR downloaded."
            }
        }
    }
    preBuild.dependsOn("downloadFFmpegKitAar")
}
// END withFFmpegKitApp
`;

    if (!contents.includes('BEGIN withFFmpegKitApp')) {
      cfg.modResults.contents = contents + patch;
    }
    return cfg;
  });

  return config;
};

module.exports = withFFmpegKit;
