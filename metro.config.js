const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "zod/v4": path.resolve(__dirname, "node_modules/zod/v4/index.js"),
};

module.exports = config;
