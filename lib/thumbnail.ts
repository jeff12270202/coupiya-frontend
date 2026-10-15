// ============================================================================
// lib/thumbnail.ts —— 全球生产级缩略图 URL 工具
// ----------------------------------------------------------------------------
// 职责：把 Saleor 返回的缩略图路径（相对路径 / 完整 URL）统一转为完整媒体地址，
//       并支持追加 Saleor 缩略图尺寸参数（?size=）。
//
// 相对原版的全部升级：
//   1. 【致命修复】不再使用 NEXT_PUBLIC_MEDIA_BASE_URL（您环境里根本没有这个变量，
//      兜底还是错误的 api.coupiya.com）——统一委托给 lib/media-url.ts 的
//      getMediaUrl()（读 NEXT_PUBLIC_MEDIA_URL = https://media.coupiya.com），
//      /thumbnail/ 相对路径、localhost、MinIO、http 协议同域全部归一化，一份实现
//   2. 【尺寸参数】支持可选 size，自动追加 ?size= 或 &size=，且幂等（已带不重复加）
//   3. 【类型守卫】path 允许 null/undefined（GraphQL 常见），非字符串安全返回空串
//   4. 【语义一致】getMediaUrl 已处理协议相对地址透传，本工具不再重复实现
// ============================================================================

import { getMediaUrl } from './media-url';

/**
 * 获取缩略图完整 URL。
 * @param path  相对路径（/thumbnail/xxx/4096/）或完整 URL（http(s)://...）
 * @param size  可选：Saleor 缩略图尺寸（像素，如 256 / 512），自动追加 size 参数
 */
export function getThumbnailUrl(path?: string | null, size?: number | null): string {
  // 统一走 canonical 归一化（含空值/类型守卫）
  const url = getMediaUrl(path);
  if (!url) return '';

  // 尺寸参数：仅接受正整数；幂等——已存在 size 参数则不重复追加
  if (typeof size === 'number' && Number.isInteger(size) && size > 0) {
    if (/[?&]size=/.test(url)) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}size=${size}`;
  }
  return url;
}

/** 兼容别名 */
export const normalizeThumbnailUrl = getThumbnailUrl;
