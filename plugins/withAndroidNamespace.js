const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Adds namespace declarations for libraries that don't specify them (required for AGP 8+).
 * Uses subprojects + plugins.withId to avoid afterEvaluate Gradle 8+ conflict.
 */
const withAndroidNamespace = (config) => {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language === 'groovy') {
      cfg.modResults.contents = patchBuildGradle(cfg.modResults.contents);
    }
    return cfg;
  });
};

function patchBuildGradle(buildGradle) {
  // Remove previously added blocks
  buildGradle = buildGradle.replace(/\/\/ BEGIN withAndroidNamespace[\s\S]*?\/\/ END withAndroidNamespace\n?/g, '');

  const patch = `
// BEGIN withAndroidNamespace
subprojects {
    plugins.withId("com.android.library") {
        if (project.name == "ffmpeg-kit-react-native") {
            android.namespace = "com.arthenica.ffmpegkit.reactnative"
        }
        if (project.name == "rnwhisper") {
            android.namespace = "com.rnwhisper"
        }
    }
}
// END withAndroidNamespace
`;

  return buildGradle + patch;
}

module.exports = withAndroidNamespace;
