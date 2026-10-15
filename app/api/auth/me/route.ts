// ============================================================================
// app/api/auth/me/route.ts —— 获取当前登录用户（useAuth 依赖）
// ----------------------------------------------------------------------------
// 契约（与 hooks/useAuth.ts 一致）：
//   200: { user: { id, nickname, username?, avatar?, balance, isFrozen?, needsPassword? } }
//   401: 未登录
// needsPassword=true：刷脸已注册但尚未设置强密码 → 前端必须引导补设（见 /login）。
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  let sessionUser: { id: number } | null = null;
  try {
    const session = await import('@/lib/session');
    sessionUser = await session.getSessionUser(req);
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', svc: 'auth-me', event: 'session_lib_error', error: (e as Error)?.message }));
    return NextResponse.json({ error: '会话服务异常' }, { status: 500 });
  }

  if (!sessionUser) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const ledger = await import('@/lib/ledger');
    const user = await ledger.prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true, nickname: true, avatar: true, balance: true, status: true,
        username: true, passwordSetAt: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }
    return NextResponse.json({
      user: {
        id: user.id,
        nickname: user.nickname || `创作者 ${user.id}`,
        username: user.username ?? undefined,
        avatar: user.avatar ?? undefined,
        balance: user.balance,
        isFrozen: user.status === 'frozen',
        needsPassword: !user.passwordSetAt,
      },
    });
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', svc: 'auth-me', event: 'user_load_failed', error: (e as Error)?.message }));
    return NextResponse.json({ error: '用户数据加载失败' }, { status: 500 });
  }
}
