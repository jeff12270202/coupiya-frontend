export const MEDIA_BASE_URL = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || 'https://api.coupiya.com';

/**
 * 将任意图片 URL 转换为可通过 Nginx 代理的公网 HTTPS URL
 */
export function normalizeImageUrl(url: string | undefined | null): string {
  if (!url) return `${MEDIA_BASE_URL}/placeholder.png`;

  // 已经是正确的公网地址，直接返回
  if (url.startsWith('https://api.coupiya.com')) return url;

  // 替换 MinIO 内网地址
  if (url.includes('43.166.132.156:9002')) {
    return url.replace(/https?:\/\/43\.166\.132\.156:9002\/saleor-media/, `${MEDIA_BASE_URL}/media`);
  }

  // 替换 localhost 地址（包括 thumbnail 路径）
  if (url.includes('localhost:8000')) {
    return url.replace(/http:\/\/localhost:8000/, MEDIA_BASE_URL);
  }

  // 处理相对路径（以 /thumbnail/ 或 /media/ 开头）
  if (url.startsWith('/thumbnail/') || url.startsWith('/media/')) {
    return `${MEDIA_BASE_URL}${url}`;
  }

  // 其他 http/https 图片（如占位图）直接返回
  if (url.startsWith('http')) return url;

  // 兜底：相对路径
  return `${MEDIA_BASE_URL}/media/${url}`;
}

// 保留旧的函数名以便兼容
export const getImageUrl = normalizeImageUrl;
export const getThumbnailUrl = normalizeImageUrl;