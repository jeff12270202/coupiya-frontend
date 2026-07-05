export function getMediaUrl(url?: string | null): string {
  if (!url) return "";

  // 1. 替换 localhost 的媒体路径
  if (url.startsWith("http://localhost:8000/media/")) {
    return url.replace("http://localhost:8000/media/", "https://media.coupiya.com/");
  }
  // 2. 新增：替换 localhost 的缩略图 (thumbnail) 路径 💡 关键修复点
  if (url.startsWith("http://localhost:8000/thumbnail/")) {
    return url.replace("http://localhost:8000/thumbnail/", "https://media.coupiya.com/thumbnail/");
  }

  // 3. 替换 MinIO 内部地址
  if (url.startsWith("http://minio:9000/saleor-media/")) {
    return url.replace("http://minio:9000/saleor-media/", "https://media.coupiya.com/");
  }

  // 4. 如果已经是完整正确的 media.coupiya.com 链接，直接返回
  if (url.startsWith("https://media.coupiya.com/")) return url;

  // 5. 处理相对路径
  if (url.startsWith("/media/")) {
    return `https://media.coupiya.com${url}`;
  }
  // 6. 新增：处理相对路径的 /thumbnail/
  if (url.startsWith("/thumbnail/")) {
    return `https://media.coupiya.com${url}`;
  }

  // 兜底
  return url;
}