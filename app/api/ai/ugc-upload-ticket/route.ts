// ============================================================================
// app/api/ai/ugc-upload-ticket/route.ts —— 极客空间 COS 预签名上传（无密钥落地）
// ----------------------------------------------------------------------------
// 职责：main.py 在用户工作区内调用本接口（携带 COUPIYA_PUBLISH_TOKEN），
//       换取【短期 COS 预签名 PUT 地址】与【最终公开地址】。
//       —— 平台 COS 密钥永远只存在于服务端，工作区/客户端零接触。
// 鉴权：发布令牌（HMAC，令牌内 userId 为准），与 publish-vod-movie 同一体系。
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const CFG = {
  cosSecretId: process.env.COS_SECRET_ID || process.env.SECRET_ID || '',
  cosSecretKey: process.env.COS_SECRET_KEY || process.env.SECRET_KEY || '',
  bucket: process.env.COS_BUCKET || '',
  region: process.env.COS_REGION || '',
  /** 预签名有效期（秒） */
  expiresIn: Number(process.env.UGC_UPLOAD_TICKET_TTL ?? 900),
  /** 允许的成片扩展名（防任意文件落地） */
  allowedExts: ['mp4', 'webm', 'mov'],
};

/* ---- 工具 ---- */

function makeRequestId(): string {
  return crypto.randomUUID();
}

function log(level: 'info' | 'warn' | 'error', requestId: string, event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'ugc-upload-ticket', requestId, event, ...extra });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function err(code: string, message: string, status: number, requestId: string) {
  return NextResponse.json({ success: false, code, message, requestId }, { status });
}

const rateBuckets = new Map<string, number[]>();
function rateLimitCheck(key: string): boolean {
  const now = Date.now();
  const arr = (rateBuckets.get(key) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= 10) return false;
  arr.push(now);
  rateBuckets.set(key, arr);
  return true;
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip') || 'unknown';
}

function sanitizeFilename(raw: unknown): string {
  const name = String(raw ?? 'output.mp4').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'mp4';
  return CFG.allowedExts.includes(ext) ? name : `output.${ext in CFG.allowedExts ? ext : 'mp4'}`;
}

/* ---- 主路由 ---- */

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();

  if (!rateLimitCheck(`ticket:${getClientIp(req)}`)) {
    return err('ERR_RATE_LIMITED', '操作过于频繁，请稍后再试', 429, requestId);
  }

  // ---- 鉴权：发布令牌（工作区内唯一身份凭证） ----
  const token = req.headers.get('x-coupiya-publish-token') ?? '';
  let userId = 0;
  try {
    const pt = await import('@/lib/publish-token');
    if (!pt.publishSecretConfigured()) {
      return err('ERR_CONFIG', '发布令牌服务未配置', 503, requestId);
    }
    const verified = pt.verifyPublishToken(token);
    if (!verified) return err('ERR_AUTH', '发布凭证无效或已过期，请重新进入创作空间', 401, requestId);
    userId = verified.userId;
  } catch (e) {
    log('error', requestId, 'token_lib_error', { error: (e as Error)?.message });
    return err('ERR_CONFIG', '发布令牌服务异常', 503, requestId);
  }

  // ---- 解析文件名 ----
  let filename = 'output.mp4';
  try {
    const body = (await req.json().catch(() => ({}))) as { filename?: unknown };
    filename = sanitizeFilename(body.filename);
  } catch {
    /* 默认名 */
  }

  // ---- COS 配置校验 ----
  if (!CFG.cosSecretId || !CFG.cosSecretKey || !CFG.bucket || !CFG.region) {
    return err('ERR_CONFIG', 'COS 未配置（COS_BUCKET / COS_REGION / SECRET_ID / SECRET_KEY）', 503, requestId);
  }

  // ---- 生成预签名 PUT 地址（cos-nodejs-sdk-v5） ----
  try {
    const mod = await import('cos-nodejs-sdk-v5');
    const COS = (mod.default ?? mod) as unknown as new (opts: { SecretId: string; SecretKey: string }) => {
      getAuthorization: (
        params: { Method: string; Key: string; Expires: number },
        cb: (err: Error | null, auth: string) => void,
      ) => void;
    };
    const cos = new COS({ SecretId: CFG.cosSecretId, SecretKey: CFG.cosSecretKey });
    const key = `ugc/${userId}/${requestId}/${filename}`;

    const auth = await new Promise<string>((resolve, reject) => {
      cos.getAuthorization({ Method: 'put', Key: key, Expires: CFG.expiresIn }, (e, a) =>
        e ? reject(e) : resolve(a),
      );
    });

    const host = `https://${CFG.bucket}.cos.${CFG.region}.myqcloud.com`;
    const uploadUrl = `${host}/${encodeURIComponent(key)}?${auth}`;
    const publicUrl = `${host}/${encodeURIComponent(key)}`;

    log('info', requestId, 'ticket_issued', { userId, key, expiresIn: CFG.expiresIn });
    return NextResponse.json({
      success: true,
      uploadUrl,
      publicUrl,
      key,
      expiresIn: CFG.expiresIn,
      requestId,
    });
  } catch (e) {
    log('error', requestId, 'ticket_failed', { error: (e as Error)?.message });
    return err('ERR_UPSTREAM', '生成上传地址失败，请稍后重试', 502, requestId);
  }
}
