const fs = require('fs');
const path = 'c:/Users/yang4/Desktop/coupiya-frontend/lib/utils.ts';

const newContent = `export const MEDIA_BASE_URL = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || 'https://api.coupiya.com';

export function normalizeImageUrl(url: string | undefined | null): string {
  if (!url) return \`\${MEDIA_BASE_URL}/placeholder.png\`;

  // 已经是 MEDIA_BASE_URL 前缀的完整 URL → 直接返回
  if (url.startsWith(\`\${MEDIA_BASE_URL}/\`)) return url;

  // 已经是 nginx 代理的媒体域名 → 直接返回
  if (url.startsWith('https://media.coupiya.com/')) return url;

  // 替换 MinIO 内网地址
  if (url.includes('43.166.132.156:9002')) {
    return url.replace(/https?:\\/\\/43\\.166\\.132\\.156:9002\\/saleor-media/, \`\${MEDIA_BASE_URL}/media\`);
  }

  // 替换 localhost 地址（开发环境，兼容 http/https）
  if (url.includes('localhost:8000')) {
    return url.replace(/https?:\\/\\/localhost:8000/, MEDIA_BASE_URL);
  }

  // 处理相对路径：/thumbnail/, /thumbnails/, /media/
  if (url.startsWith('/thumbnail/') || url.startsWith('/thumbnails/') || url.startsWith('/media/')) {
    return \`\${MEDIA_BASE_URL}\${url.replace(/^\\/thumbnails?/, '/media')}\`;
  }

  // 已经是其他绝对 HTTP(S) URL → 直接返回
  if (url.startsWith('http')) return url;

  // 其他相对路径 → 拼上 media 前缀
  return \`\${MEDIA_BASE_URL}/media/\${url}\`;
}

// 保留旧的函数名以便兼容
export const getImageUrl = normalizeImageUrl;
export const getThumbnailUrl = normalizeImageUrl;
`;

fs.writeFileSync(path, newContent, 'utf8');
console.log('utils.ts updated successfully');
