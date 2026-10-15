// ============================================================================
// lib/publish-token.ts —— 发布令牌（HMAC 签名，防伪造 user_id）
// ----------------------------------------------------------------------------
// 为什么需要它：publish-vod-movie 接收来自 Cloud Studio（极客空间）的发布请求，
// 请求体里的 user_id 是 Python 脚本自己填的，可直接被伪造（任何人传别人 ID 上墙）。
// 正确做法：创建用户工作区时（create-ugc-studio）为该用户签发一个带 HMAC 签名的
// 发布令牌，注入工作区环境变量 COUPIYA_PUBLISH_TOKEN；main.py 发布时携带该令牌，
// 服务端验签后以【令牌内的 userId】为准，忽略请求体里的 user_id。
//
// 环境变量：COUPIYA_PUBLISH_SECRET（必配，生产 fail-closed）
// ============================================================================

import { createHmac, timingSafeEqual } from 'crypto';

const SECRET = process.env.COUPIYA_PUBLISH_SECRET ?? '';
const TTL_SECONDS = Number(process.env.PUBLISH_TOKEN_TTL_SECONDS ?? 7 * 24 * 3600); // 默认 7 天

export function publishSecretConfigured(): boolean {
  return SECRET.length > 0;
}

/** 为指定用户签发发布令牌（create-ugc-studio 创建空间时调用） */
export function signPublishToken(userId: number): string {
  if (!SECRET) throw new Error('COUPIYA_PUBLISH_SECRET_NOT_CONFIGURED');
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS }),
  ).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** 校验发布令牌；合法返回 { userId }，非法/过期返回 null */
export function verifyPublishToken(token: string): { userId: number } | null {
  if (!SECRET) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return null;

  const expected = createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: unknown;
      exp?: unknown;
    };
    if (typeof data.uid !== 'number' || !Number.isInteger(data.uid) || data.uid <= 0) return null;
    if (typeof data.exp === 'number' && data.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: data.uid };
  } catch {
    return null;
  }
}
