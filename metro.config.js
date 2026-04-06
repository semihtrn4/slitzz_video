const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo SDK 54: package exports desteği (expo-router 6, zustand, vb. için gerekli)
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
