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
