/**
 * Ensures a single slash between base directory and sub path.
 */
export const getPath = (base: string | null | undefined, sub: string): string => {
  if (!base) return sub;
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanSub = sub.startsWith('/') ? sub.substring(1) : sub;
  return `${cleanBase}${cleanSub}`;
};
