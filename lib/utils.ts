// ============================================================================
// lib/utils.ts —— 兼容枢纽（re-export hub）
// ----------------------------------------------------------------------------
// 说明：URL 归一化逻辑已收敛到 lib/media-url.ts（canonical）与 lib/thumbnail.ts
//       （缩略图 + size 参数）。本文件仅为兼容旧 import 的再导出枢纽，不重复实现。
//
// 相对原版的全部升级：
//   1. 【删除假占位图】原 normalizeImageUrl 对空值返回 `${base}/placeholder.png` ——
//      这是全站反复清除的「假内容冒充真实资源」反模式：占位图不存在时就是裂图，
//      存在时则掩盖数据缺失、让用户误以为资源真实存在。现统一返回空串，由组件
//      渲染自己的骨架/占位 UI（诚实契约，fail-closed）
//   2. 【修正环境变量】NEXT_PUBLIC_MEDIA_BASE_URL 不存在 → 统一读 NEXT_PUBLIC_MEDIA_URL
//   3. 【单一实现】所有归一化逻辑收敛到 media-url.ts（含 /thumbnails/ 复数、MinIO
//      内网 IP 43.166.132.156:9002、localhost、协议同域、http→https），本文件只再导出
// ============================================================================

import { normalizeImageUrl } from './media-url';

export { getMediaUrl, normalizeImageUrl } from './media-url';
export { getThumbnailUrl } from './thumbnail';

/** 旧代码兼容别名 */
export const getImageUrl = normalizeImageUrl;

/** 兼容旧 import 的媒体域名常量（已归一化，无尾部斜杠） */
export const MEDIA_BASE_URL = (process.env.NEXT_PUBLIC_MEDIA_URL || 'https://media.coupiya.com')
  .trim()
  .replace(/\/+$/, '');
