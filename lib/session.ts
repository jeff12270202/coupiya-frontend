// ============================================================================
// lib/session.ts —— 网站登录会话（HttpOnly 签名 Cookie，JWT 风格 HMAC）
// ----------------------------------------------------------------------------
// 职责：刷脸登录成功 → 签发会话令牌（uid + exp + HMAC 签名）写入 HttpOnly
//       Cookie；/api/auth/me、create-ugc-studio、publish-vod-movie 等路由通过
//       getSessionUser(req) 还原用户身份。
//
// 安全要点：
//   - HttpOnly + SameSite=Lax + 生产 Secure；JS 无法读取，防 XSS 盗号
//   - HMAC 签名防篡改；过期即失效
//   - 密钥：SESSION_SECRET（缺省回退 COUPIYA_PUBLISH_SECRET，两者都必配其一）
// ============================================================================

import { createHmac, timingSafeEqual } from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';

const SECRET = process.env.SESSION_SECRET || process.env.COUPIYA_PUBLISH_SECRET || '';
const COOKIE_NAME = 'coupiya_session';
const TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 30 * 24 * 3600); // 默认 30 天

export function sessionSecretConfigured(): boolean {
  return SECRET.length > 0;
}

/** 签发会话令牌（base64url payload.sig） */
export function createSessionToken(userId: number): string {
  if (!SECRET) throw new Error('SESSION_SECRET_NOT_CONFIGURED');
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS }),
  ).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** 校验会话令牌；合法返回 { userId }，非法/过期返回 null */
export function verifySessionToken(token: string): { userId: number } | null {
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

/** 解析 Cookie 头（零依赖，不引入 cookie 包） */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(value);
      } catch {
        out[key] = value;
      }
    }
  }
  return out;
}

/**
 * 从请求还原登录用户（仅解析会话，不查库；需要余额等资料请再查 ledger/user）
 * 返回 null = 未登录或会话失效。
 */
export async function getSessionUser(req: NextRequest): Promise<{ id: number } | null> {
  const cookies = parseCookies(req.headers.get('cookie'));
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const verified = verifySessionToken(token);
  return verified ? { id: verified.userId } : null;
}

/** 写入会话 Cookie（登录成功后调用） */
export function setSessionCookie(res: NextResponse, userId: number): NextResponse {
  const token = createSessionToken(userId);
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_SECONDS,
  });
  return res;
}

/** 清除会话 Cookie（登出） */
export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
