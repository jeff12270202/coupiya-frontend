// ============================================================================
// app/api/account/user-brief/route.ts —— 用户昵称批量解析（公开只读）
// ----------------------------------------------------------------------------
// 用途：电影墙「作者：@xxx」真名化——前台拿到 author_user_id 列表后，批量换取
//       { id, nickname }，只返回荣誉信息，不泄漏余额/邮箱等敏感字段。
// 公开访问：创作者昵称是公开荣誉标签（对标 YouTube），无需登录。
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('ids') ?? '';
  const ids = [
    ...new Set(
      raw
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].slice(0, 50); // 单次最多 50 个，防滥用

  if (ids.length === 0) {
    return NextResponse.json({ success: true, users: [] });
  }

  try {
    const ledger = await import('@/lib/ledger');
    const users = await ledger.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, nickname: true, avatar: true },
    });
    return NextResponse.json({
      success: true,
      users: users.map((u) => ({
        id: u.id,
        nickname: u.nickname || `创作者 ${u.id}`,
        avatar: u.avatar ?? undefined,
      })),
    });
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', svc: 'user-brief', event: 'query_failed', error: (e as Error)?.message }));
    return NextResponse.json({ success: false, users: [] }, { status: 500 });
  }
}
