// ============================================================================
// lib/wp-upload.ts —— 全球生产级 WordPress 媒体上传工具
// ----------------------------------------------------------------------------
// 职责：把文件 Blob 通过 WordPress REST API（wp/v2/media）上传为媒体附件，
//       返回 id / 完整 URL / 标题 / MIME。
//
// 相对原版的全部升级：
//   1. 【致命修复】凭证变量名 —— 原代码读 WP_USER/WP_PASSWORD（.env.local 里
//      不存在！），您的真实变量是 WP_ADMIN_USER / WP_APP_PASSWORD。
//      现优先读真实变量，旧名作兼容兜底
//   2. 【致命修复】端点拼接 —— 原代码把 NEXT_PUBLIC_WP_REST_URL 后直接拼
//      wp/v2/media，但您的环境值已含 /wp/v2，会拼成 .../wp/v2wp/v2/media 全挂。
//      现做尾部归一化并按「是否已含 /wp/v2」推导端点
//   3. 【超时】上传加 AbortController + 60s 超时（可配 WP_UPLOAD_TIMEOUT_MS）
//   4. 【大小上限】默认 10MB（可配 WP_UPLOAD_MAX_BYTES），防止占满 WP 存储/带宽
//   5. 【类型白名单】fileType 参数不再闲置：jpeg/png/webp/gif 之外一律拒绝
//   6. 【错误截断】WP 返回的超长 HTML/错误只取前 300 字符，防日志刷屏
//   7. 【结果补全】返回 mime_type；id 强转 Number；非 JSON 响应兜底
// ============================================================================

const CFG = {
  wpUser: process.env.WP_ADMIN_USER || process.env.WP_USER || '',
  wpPassword: process.env.WP_APP_PASSWORD || process.env.WP_PASSWORD || '',
  wpRestBase: (process.env.NEXT_PUBLIC_WP_REST_URL || 'https://api.coupiya.com/wordpress/wp-json/').replace(/\/+$/, ''),
  uploadTimeoutMs: Number(process.env.WP_UPLOAD_TIMEOUT_MS ?? 60_000),
  maxBytes: Number(process.env.WP_UPLOAD_MAX_BYTES ?? 10 * 1024 * 1024),
};

/** 允许上传的图片 MIME 白名单 */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * 推导 WordPress 媒体端点：
 * - 配置值已含 /wp/v2（如 NEXT_PUBLIC_WP_REST_URL=.../wp-json/wp/v2）→ 追加 /media
 * - 配置值仅为 wp-json 根（默认值）→ 追加 /wp/v2/media
 */
function mediaEndpoint(base: string): string {
  return base.endsWith('/wp/v2') ? `${base}/media` : `${base}/wp/v2/media`;
}

export interface WpUploadResult {
  id: number;
  url: string;
  title: string;
  mimeType: string;
}

/**
 * 上传文件到 WordPress 媒体库。
 * @param fileBlob 文件内容（Blob）
 * @param fileName 文件名（用于标题与扩展名）
 * @param fileType MIME 类型（可选；提供时按白名单校验）
 * @param opts     可选：timeoutMs 覆盖默认 60s 超时
 */
export async function uploadToWordPress(
  fileBlob: Blob,
  fileName: string,
  fileType?: string,
  opts?: { timeoutMs?: number },
): Promise<WpUploadResult> {
  // ---- 凭证校验（fail-fast） ----
  if (!CFG.wpUser || !CFG.wpPassword) {
    throw new Error('WordPress 上传凭证未配置：请在 .env.local 设置 WP_ADMIN_USER 与 WP_APP_PASSWORD');
  }

  // ---- 内容校验 ----
  if (!fileBlob || fileBlob.size <= 0) throw new Error('上传内容为空');
  if (fileBlob.size > CFG.maxBytes) {
    throw new Error(`文件超过大小上限（${Math.round(CFG.maxBytes / 1024 / 1024)}MB）`);
  }
  if (fileType && !ALLOWED_MIME.has(fileType)) {
    throw new Error(`不支持的文件类型：${fileType}（仅支持 JPG / PNG / WebP / GIF）`);
  }

  // ---- 上传（带超时） ----
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? CFG.uploadTimeoutMs);
  try {
    const formData = new FormData();
    formData.append('file', fileBlob, fileName || 'upload.jpg');
    formData.append('title', fileName || 'upload');

    const res = await fetch(mediaEndpoint(CFG.wpRestBase), {
      method: 'POST',
      headers: {
        // WordPress REST 官方鉴权：应用密码 Basic Auth（不用 cookie）
        Authorization: `Basic ${Buffer.from(`${CFG.wpUser}:${CFG.wpPassword}`).toString('base64')}`,
      },
      body: formData,
      signal: controller.signal,
    });

    // 响应可能是 JSON（正常）或 HTML/空（网关错误）——统一兜底
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* 非 JSON：走下方错误分支 */
    }

    if (!res.ok || !data?.id) {
      const msg = String(data?.message ?? text ?? res.statusText ?? '未知错误').slice(0, 300);
      throw new Error(`上传到 WordPress 失败（HTTP ${res.status}）: ${msg}`);
    }

    const guid = data.guid as Record<string, unknown> | undefined;
    const title = data.title as Record<string, unknown> | undefined;
    return {
      id: Number(data.id),
      url: String(data.source_url ?? guid?.rendered ?? ''),
      title: String(title?.rendered ?? fileName),
      mimeType: String(data.mime_type ?? fileType ?? ''),
    };
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('上传到 WordPress 超时，请稍后重试');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
