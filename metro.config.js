const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");

let config = getDefaultConfig(__dirname);

config = withRorkMetro(config);

config.resolver.unstable_enablePackageExports = true;

const path = require("path");
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "zod/v4": path.resolve(__dirname, "node_modules/zod/v4/index.js"),
};

module.exports = config;
