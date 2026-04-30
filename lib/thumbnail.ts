export function getThumbnailUrl(path: string) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  // 如果是相对路径如 '/thumbnail/xxx/4096/'，转换为完整 URL
  return `https://api.coupiya.com${path}`;
}