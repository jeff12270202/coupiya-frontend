export function getThumbnailUrl(path: string) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  // 如果是相对路径如 '/thumbnail/xxx/4096/'，转换为完整 URL
  const MEDIA_BASE_URL = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || 'https://api.coupiya.com';
  return `${MEDIA_BASE_URL}${path}`;
}