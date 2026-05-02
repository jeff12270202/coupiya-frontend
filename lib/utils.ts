export const MEDIA_BASE_URL = 'https://api.coupiya.com';

export function normalizeImageUrl(url: string | undefined | null): string {
  if (!url) return `${MEDIA_BASE_URL}/placeholder.png`;

  // 已经是正确公网地址，直接返回
  if (url.startsWith('https://api.coupiya.com/media/')) return url;

  // 替换内网 MinIO 地址
  if (url.includes('43.166.132.156:9002')) {
    return url.replace(/https?:\/\/43\.166\.132\.156:9002\/saleor-media/, `${MEDIA_BASE_URL}/media`);
  }

  // 替换 localhost 地址
  if (url.includes('localhost:8000')) {
    return url.replace(/http:\/\/localhost:8000/, MEDIA_BASE_URL);
  }

  // 处理 /thumbnail/ 或 /thumbnails/ 路径（注意两种拼写）
  if (url.startsWith('/thumbnail/') || url.startsWith('/thumbnails/')) {
    return `${MEDIA_BASE_URL}/media${url.replace(/^\/thumbnails?/, '')}`;
  }

  // 处理 /media/ 相对路径
  if (url.startsWith('/media/')) {
    return `${MEDIA_BASE_URL}${url}`;
  }

  // 其他 http/https 直接返回
  if (url.startsWith('http')) return url;

  // 兜底
  return `${MEDIA_BASE_URL}/media/${url}`;
}

// 保留旧的函数名以便兼容
export const getImageUrl = normalizeImageUrl;
export const getThumbnailUrl = normalizeImageUrl;