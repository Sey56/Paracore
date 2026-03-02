
export const getFolderNameFromPath = (path: string) => {
  if (!path) return '';
  const parts = path.split(/[\\/]/);
  return parts.pop() || '';
};

export const normalizePath = (p: string) => {
  if (!p) return "";
  return p
    .replace(/^\\\\?\\/, '') // Remove Windows long path prefix if present
    .replace(/\\/g, '/')     // Uniform forward slashes
    .replace(/\/+$/, '')     // Remove trailing slashes
    .toLowerCase()
    .trim();
};

