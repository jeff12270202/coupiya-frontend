// ============================================================================
// app/api/auth/password/set/route.ts —— 刷脸注册后设置强密码（一次性补设）
// ----------------------------------------------------------------------------
// 规则（用户澄清版 v2）：
//   刷脸核身通过 → 签发会话（needsPassword=true）→ 本接口补设
//   username（唯一）+ 强密码 → 此后仅用 账号+密码 登录。
// 安全：会话鉴权；只允许未设密码的账号执行一次（幂等：已设置 → 409）；
//       scrypt 哈希；username 唯一冲突 → 409 提示更换。
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

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();

  // ---- 会话鉴权（刷脸注册后已自动登录） ----
  let sessionUser: { id: number } | null = null;
  try {
    const session = await import('@/lib/session');
    sessionUser = await session.getSessionUser(req);
  } catch {
    /* 下方统一处理 */
  }
  if (!sessionUser) return err('ERR_AUTH', '登录状态已失效，请重新刷脸注册', 401, requestId);

  // ---- 解析 ----
  let usernameRaw = '';
  let password = '';
  try {
    const body = (await req.json()) as { username?: unknown; password?: unknown };
    usernameRaw = String(body.username ?? '').trim().slice(0, 64);
    password = String(body.password ?? '').slice(0, 128);
  } catch {
    return err('ERR_VALIDATION', '请求体必须是 JSON', 400, requestId);
  }
  if (!usernameRaw || !password) {
    return err('ERR_VALIDATION', '请输入登录账号与强密码', 400, requestId);
  }

  try {
    const lib = await import('@/lib/password');
    const usernameRes = lib.normalizeUsername(usernameRaw);
    if (!usernameRes.ok) return err('ERR_VALIDATION', usernameRes.error, 400, requestId);
    const passwordError = lib.validateStrongPassword(password);
    if (passwordError) return err('ERR_VALIDATION', passwordError, 400, requestId);

    const ledger = await import('@/lib/ledger');
    const prisma = ledger.prisma;

    const me = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { passwordSetAt: true },
    });
    if (!me) return err('ERR_AUTH', '用户不存在', 401, requestId);
    if (me.passwordSetAt) {
      return err('ERR_STATE', '已设置过密码，请直接使用 账号+密码 登录', 409, requestId);
    }

    // username 唯一性
    const conflict = await prisma.user.findUnique({ where: { username: usernameRes.username } });
    if (conflict && conflict.id !== sessionUser.id) {
      return err('ERR_VALIDATION', '该登录账号已被占用，请换一个', 409, requestId);
    }

    const updated = await prisma.user.update({
      where: { id: sessionUser.id },
      data: {
        username: usernameRes.username,
        passwordHash: lib.hashPassword(password),
        passwordSetAt: new Date(),
      },
      select: {
        id: true, nickname: true, avatar: true, username: true, balance: true, status: true, passwordSetAt: true,
      },
    });

    console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', svc: 'auth-password-set', requestId, event: 'password_set', userId: updated.id }));
    return NextResponse.json({
      success: true,
      user: {
        id: updated.id,
        nickname: updated.nickname || `创作者 ${updated.id}`,
        username: updated.username ?? undefined,
        avatar: updated.avatar ?? undefined,
        balance: updated.balance,
        isFrozen: updated.status === 'frozen',
        needsPassword: false,
      },
      requestId,
    });
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', svc: 'auth-password-set', requestId, event: 'set_failed', error: (e as Error)?.message }));
    return err('ERR_INTERNAL', '设置密码失败，请稍后重试', 500, requestId);
  }
}
