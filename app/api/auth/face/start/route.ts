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
    const { ticket, verifyUrl } = await faceid.startFaceVerify();
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', svc: 'face-start', requestId, event: 'face_started' }));
    return NextResponse.json({ success: true, ticket, verifyUrl, requestId });
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', svc: 'face-start', requestId, event: 'face_start_failed', error: (e as Error)?.message }));
    return err('ERR_UPSTREAM', `发起刷脸失败：${(e as Error)?.message ?? '未知错误'}`, 502, requestId);
  }
}
