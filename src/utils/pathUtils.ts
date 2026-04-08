/**
 * Ensures a single slash between base directory and sub path.
 * If base is null/undefined, returns an empty string or the sub path.
 */
export const getPath = (base: string | { uri: string } | null | undefined, sub: string): string => {
  if (!base) return sub;
  const baseUri = typeof base === 'string' ? base : base.uri;
  const separator = baseUri.endsWith('/') ? '' : '/';
  return `${baseUri}${separator}${sub}`;
};

/**
 * Ensures a path starts with 'file://' if it's a local path and doesn't have a protocol.
 * Used by Expo FileSystem APIs which require the file:// scheme.
 */
export const ensureAbsolute = (path: string): string => {
  if (!path) return '';
  if (path.includes('://')) return path;
  // If it starts with / but not file://, add file://
  if (path.startsWith('/')) return `file://${path}`;
  // For relative-looking paths on mobile, they usually belong to the app bundle or document dir
  // but expo-file-system 19/20 is very strict.
  return `file://${path}`;
};

/**
 * Strips the 'file://' protocol prefix from a URI, returning a raw absolute path.
 * FFmpeg on Android/iOS does NOT accept 'file://' URIs — it needs raw paths like /data/user/0/...
 * Use this for all paths passed to FFmpeg commands.
 */
export const stripFileProtocol = (path: string): string => {
  if (!path) return '';
  if (path.startsWith('file://')) return path.slice(7);
  return path;
};
