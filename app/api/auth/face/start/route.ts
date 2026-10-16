// ============================================================================
// app/api/auth/face/start/route.ts —— 发起刷脸核身（腾讯云基础版人脸核身）
// ----------------------------------------------------------------------------
// 契约（与 components/FaceAuthModal.tsx 一致）：
//   200: { ticket: string, verifyUrl: string }   // verifyUrl 为腾讯云核身页面
//   4xx/5xx: { error: string, code?, requestId? }
// 流程：签发核身令牌 → 前端新窗口打开 verifyUrl → 用户完成刷脸 →
//       前端轮询 GET /api/auth/face/result?ticket=...
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

function makeRequestId(): string {
  return crypto.randomUUID();
}

function err(code: string, message: string, status: number, requestId: string) {
  return NextResponse.json({ success: false, code, message, error: message, requestId }, { status });
}

const rateBuckets = new Map<string, number[]>();
function rateLimitCheck(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 10; // 刷脸发起频繁，默认 10 次/分钟/IP
  const arr = (rateBuckets.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  rateBuckets.set(ip, arr);
  return true;
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * 推导站点对外可访问的源，用于拼接核身完成后的回跳地址（DetectAuth 的 RedirectUrl）。
 * 优先级：NEXT_PUBLIC_SITE_URL → 反向代理透传的 Host → 固定回退。
 * ⚠️ 不能直接用 req.nextUrl.origin：在腾讯云 nginx 反代下它可能是 http://127.0.0.1:3000，
 *    那样的回跳地址对用户手机完全不可达。
 */
function siteOrigin(req: NextRequest): string {
  const envUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
  if (envUrl) return envUrl;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  if (host && !/^(127\.0\.0\.1|localhost|\[::1\])/i.test(host)) {
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${host}`;
  }
  return 'https://www.coupiya.com';
}

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();

  if (!rateLimitCheck(getClientIp(req))) {
    return err('ERR_RATE_LIMITED', '操作过于频繁，请稍后再试', 429, requestId);
  }

  try {
    const faceid = await import('@/lib/faceid');
    if (!faceid.faceIdConfigured()) {
      return err('ERR_CONFIG', '人脸核身服务未配置（FACEID_SECRET_ID / FACEID_SECRET_KEY）', 503, requestId);
    }
    // 可选请求体：若控制台业务流程配置为「自传照片比对」，前端在此提交参照照片
    // （腾讯云限制：Base64 后不超过 3MB，仅支持 jpg/png）。
    let body: { imageBase64?: unknown; idCard?: unknown; name?: unknown } = {};
    try {
      const ct = req.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        body = (await req.json()) as typeof body;
      }
    } catch {
      // 无请求体 / 非 JSON / 空 body —— 均按「未提供」处理，交由腾讯云判定必传项
    }

    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    if (imageBase64 && imageBase64.length > 4_000_000) {
      return err('ERR_VALIDATION', '参照照片过大（Base64 后需小于 3MB），请压缩后重试', 413, requestId);
    }

    const { ticket, verifyUrl } = await faceid.startFaceVerify({
      redirectUrl: `${siteOrigin(req)}/auth/callback`,
      imageBase64: imageBase64 || undefined,
      idCard: typeof body.idCard === 'string' ? body.idCard.trim() || undefined : undefined,
      name: typeof body.name === 'string' ? body.name.trim() || undefined : undefined,
    });
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', svc: 'face-start', requestId, event: 'face_started' }));
    return NextResponse.json({ success: true, ticket, verifyUrl, requestId });
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', svc: 'face-start', requestId, event: 'face_start_failed', error: (e as Error)?.message }));
    return err('ERR_UPSTREAM', `发起刷脸失败：${(e as Error)?.message ?? '未知错误'}`, 502, requestId);
  }
}
