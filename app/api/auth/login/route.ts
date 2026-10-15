// ============================================================================
// app/api/auth/login/route.ts —— 账号 + 强密码 登录（刷脸注册后的唯一登录方式）
// ----------------------------------------------------------------------------
// 规则（用户澄清版 v2）：注册完成后直接用 账号+密码 登录，不再需要人脸识别。
// 账号 = 注册时设置的 username（唯一，小写）或兼容 email。
// 安全：scrypt 校验 + timingSafeEqual；限流；失败统一文案（不泄露账号是否存在）。
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
  const arr = (rateBuckets.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= 8) return false; // 8 次/分钟/IP，防爆破
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
    return err('ERR_RATE_LIMITED', '尝试过于频繁，请 1 分钟后再试', 429, requestId);
  }

  let account = '';
  let password = '';
  try {
    const body = (await req.json()) as { account?: unknown; password?: unknown };
    account = String(body.account ?? '').trim().toLowerCase().slice(0, 64);
    password = String(body.password ?? '').slice(0, 128);
  } catch {
    return err('ERR_VALIDATION', '请求体必须是 JSON', 400, requestId);
  }
  if (!account || !password) {
    return err('ERR_VALIDATION', '请输入账号与密码', 400, requestId);
  }

  try {
    const ledger = await import('@/lib/ledger');
    const user = await ledger.prisma.user.findFirst({
      where: { OR: [{ username: account }, { email: account }] },
      select: {
        id: true, username: true, email: true, passwordHash: true, passwordSetAt: true,
        status: true, nickname: true, avatar: true, balance: true,
      },
    });

    const lib = await import('@/lib/password');
    const ok =
      !!user &&
      !!user.passwordHash &&
      !!user.passwordSetAt &&
      lib.verifyPassword(password, user.passwordHash);

    if (!ok || !user) {
      return err('ERR_AUTH', '账号或密码错误', 401, requestId);
    }
    if (user.status === 'frozen') {
      return err('ERR_AUTH', '账号已被冻结，请联系客服', 403, requestId);
    }
    if (!user.passwordSetAt) {
      return err('ERR_AUTH', '该账号尚未设置密码，请使用刷脸注册流程补设', 403, requestId);
    }

    const session = await import('@/lib/session');
    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        nickname: user.nickname || `创作者 ${user.id}`,
        username: user.username ?? undefined,
        avatar: user.avatar ?? undefined,
        balance: user.balance,
        isFrozen: user.status === 'frozen',
        needsPassword: false,
      },
      requestId,
    });
    session.setSessionCookie(res, user.id);
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', svc: 'auth-login', requestId, event: 'login_ok', userId: user.id }));
    return res;
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', svc: 'auth-login', requestId, event: 'login_failed', error: (e as Error)?.message }));
    return err('ERR_INTERNAL', '登录服务异常，请稍后重试', 500, requestId);
  }
}
