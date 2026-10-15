// ============================================================================
// app/api/account/transactions/route.ts —— 我的消费/充值记录（登录可见）
// ----------------------------------------------------------------------------
// 契约：GET → 200 { success, items: [{ id, type, amount, balanceAfter, reason, createdAt }] }
// 仅返回当前登录用户自己的流水（会话鉴权），最多 30 条。
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  let sessionUser: { id: number } | null = null;
  try {
    const session = await import('@/lib/session');
    sessionUser = await session.getSessionUser(req);
  } catch {
    /* 下方统一处理 */
  }
  if (!sessionUser) {
    return NextResponse.json({ success: false, error: '请先刷脸登录' }, { status: 401 });
  }

  try {
    const ledger = await import('@/lib/ledger');
    const items = await ledger.prisma.creditTransaction.findMany({
      where: { userId: sessionUser.id },
      orderBy: { id: 'desc' },
      take: 30,
      select: { id: true, type: true, amount: true, balanceAfter: true, reason: true, createdAt: true },
    });
    return NextResponse.json({
      success: true,
      items: items.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        reason: t.reason,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', svc: 'account-transactions', event: 'query_failed', error: (e as Error)?.message }));
    return NextResponse.json({ success: false, error: '流水加载失败' }, { status: 500 });
  }
}
