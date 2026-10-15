// ============================================================================
// app/api/b2/presign-download/route.ts —— B2 限时下载链接（短信回传/网页提取）
// ----------------------------------------------------------------------------
// 鉴权：登录会话 + 文件必须位于自己的 u{userId}/ 前缀之下（防越权读他人文件）
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const DOWNLOAD_TTL = Number(process.env.B2_DOWNLOAD_TTL_SECONDS ?? 3600);

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

  const key = (req.nextUrl.searchParams.get('key') ?? '').slice(0, 300);
  if (!key) {
    return NextResponse.json({ success: false, error: '缺少文件 key' }, { status: 400 });
  }

  try {
    const ledger = await import('@/lib/ledger');
    const account = await ledger.prisma.b2Account.findUnique({ where: { userId: sessionUser.id } });
    if (!account) {
      return NextResponse.json({ success: false, error: '尚未开通卫星云盘' }, { status: 403 });
    }
    // 防越权：只允许访问自己前缀下的文件
    if (!key.startsWith(account.keyPrefix)) {
      return NextResponse.json({ success: false, error: '无权访问该文件' }, { status: 403 });
    }

    const b2 = await import('@/lib/b2');
    const downloadUrl = await b2.presignGet(
      { keyId: account.keyId, appKey: account.applicationKey },
      account.bucket,
      key,
      DOWNLOAD_TTL,
    );
    return NextResponse.json({ success: true, downloadUrl, key, expiresIn: DOWNLOAD_TTL });
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', svc: 'b2-presign-download', event: 'failed', error: (e as Error)?.message }));
    return NextResponse.json({ success: false, error: '生成下载链接失败' }, { status: 502 });
  }
}
