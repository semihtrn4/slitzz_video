module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // expo 54: import.meta transform (expo-router 6 için gerekli)
          unstable_transformImportMeta: true,
        },
      ],
    ],
  };
};
