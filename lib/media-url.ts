// ============================================================================
// lib/media-url.ts —— 全球生产级 Saleor 媒体 URL 归一化工具
// ----------------------------------------------------------------------------
// 职责：把 Saleor 返回的各种媒体地址（localhost 开发地址 / MinIO 内部地址 /
//       相对路径 / 不同协议的同域地址）统一映射到媒体域名
//       （NEXT_PUBLIC_MEDIA_URL，默认 https://media.coupiya.com）。
//
// 相对原版的全部升级：
//   1. 【配置中心】媒体域名不再硬编码，读 NEXT_PUBLIC_MEDIA_URL（.env.local 已配置），
//      并对尾部斜杠 / 空白做归一化
//   2. 【类型与空值守卫】入参可能为 null / undefined / 非字符串（GraphQL 响应里常见），
//      一律安全返回空串；字符串先 trim
//   3. 【语义保留】localhost media 与 MinIO 映射到媒体根路径，
//      localhost thumbnail 保留 /thumbnail/ 子路径（与业务语义完全一致）
//   4. 【同域协议归一】http://media.coupiya.com/... 自动升级为 https 并保留 path/query
//   5. 【安全透传】data: / blob: / javascript: / 协议相对等一律原样返回，不做任何改写
//   6. 【大小写兼容】域名前缀比较忽略大小写；相对路径 /media/、/thumbnail/ 统一接上域名
//   7. 导出 normalizeImageUrl 别名：作为 apolloLinks.ts（GraphQL 响应 URL 归一化）的
//      统一实现，一份代码两处复用
// ============================================================================

/** 媒体域名（环境变量优先，兜底默认值） */
const MEDIA_ORIGIN = (process.env.NEXT_PUBLIC_MEDIA_URL || 'https://media.coupiya.com')
  .trim()
  .replace(/\/+$/, ''); // 保证无尾部斜杠

/** 内部地址 → 媒体域名的显式映射（to 保留原路径语义） */
const LOCAL_MAPPINGS: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'http://localhost:8000/media/', to: `${MEDIA_ORIGIN}/` },
  { from: 'http://localhost:8000/thumbnail/', to: `${MEDIA_ORIGIN}/thumbnail/` },
  { from: 'http://minio:9000/saleor-media/', to: `${MEDIA_ORIGIN}/` },
  { from: 'http://43.166.132.156:9002/saleor-media/', to: `${MEDIA_ORIGIN}/` },
  { from: 'https://43.166.132.156:9002/saleor-media/', to: `${MEDIA_ORIGIN}/` },
];

export function getMediaUrl(url?: string | null): string {
  // ---- 空值 / 类型守卫（GraphQL 响应中 url 可能为 null 或缺失） ----
  if (typeof url !== 'string') return '';
  const value = url.trim();
  if (!value) return '';

  const isHttp = /^https?:\/\//i.test(value);
  const isRootRelative = value.startsWith('/');

  // ---- 安全透传：非 http(s) 且非根相对路径（data: / blob: / javascript: / 协议相对） ----
  if (!isHttp && !isRootRelative) return value;

  // ---- 协议相对地址（//host/...）一律原样透传，不猜宿主 ----
  if (value.startsWith('//')) return value;

  // ---- 已是目标域名（忽略大小写）→ 原样返回，避免重复拼接 ----
  if (value.toLowerCase().startsWith(MEDIA_ORIGIN.toLowerCase())) return value;

  // ---- 同一域名但协议不同（http://media.coupiya.com → https://media.coupiya.com） ----
  if (isHttp) {
    try {
      const parsed = new URL(value);
      const mediaHost = new URL(MEDIA_ORIGIN).host;
      if (parsed.host === mediaHost) {
        return MEDIA_ORIGIN + parsed.pathname + parsed.search;
      }
    } catch {
      /* 非法 URL：走下方显式映射与相对路径规则 */
    }
  }

  // ---- 本地开发 / MinIO 内部地址 → 映射到媒体域名（保留语义差异） ----
  for (const mapping of LOCAL_MAPPINGS) {
    if (value.startsWith(mapping.from)) {
      const rest = value.slice(mapping.from.length).replace(/^\/+/, '');
      return mapping.to + rest;
    }
  }

  // ---- 根相对路径（/media/、/thumbnail/）→ 直接接上媒体域名 ----
  if (value.startsWith('/media/') || value.startsWith('/thumbnail/')) {
    return MEDIA_ORIGIN + value;
  }

  // ---- 旧栈遗留：复数 /thumbnails/ → 归一到 /media/ ----
  if (value.startsWith('/thumbnails/')) {
    return MEDIA_ORIGIN + value.replace(/^\/thumbnails/, '/media');
  }

  // ---- 兜底：无法识别的地址原样返回，绝不猜测改写 ----
  return value;
}

/** 兼容别名：供 apolloLinks.ts（GraphQL 响应 URL 归一化）使用 */
export const normalizeImageUrl = getMediaUrl;
