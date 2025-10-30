
export const getFolderNameFromPath = (path: string) => {
  if (!path) return '';
  const parts = path.split(/[\\/]/);
  return parts.pop() || '';
};

