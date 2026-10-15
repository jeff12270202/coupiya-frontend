// ============================================================================
// app/api/satellite/status/route.ts —— 查询我的卫星云盘（B2）开通状态
// 只返回桶名/前缀/开通时间，绝不返回受限密钥。
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
    return NextResponse.json({ success: false, onboarded: false, error: '请先刷脸登录' }, { status: 401 });
  }

  try {
    const ledger = await import('@/lib/ledger');
    const account = await ledger.prisma.b2Account.findUnique({ where: { userId: sessionUser.id } });
    if (!account) {
      return NextResponse.json({ success: true, onboarded: false });
    }
    return NextResponse.json({
      success: true,
      onboarded: true,
      bucket: account.bucket,
      keyPrefix: account.keyPrefix,
      createdAt: account.createdAt.toISOString(),
    });
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', svc: 'satellite-status', event: 'query_failed', error: (e as Error)?.message }));
    return NextResponse.json({ success: false, onboarded: false, error: '查询失败' }, { status: 500 });
  }
}
