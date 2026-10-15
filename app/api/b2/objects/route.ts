// ============================================================================
// app/api/b2/objects/route.ts —— 「我的卫星云盘」对象管理
// ----------------------------------------------------------------------------
//   GET    /api/b2/objects          列出当前用户前缀下的全部文件（含生命周期时间点）
//   DELETE /api/b2/objects?key=xxx  删除自己前缀下的单个文件
//
// 鉴权与防越权（与 presign-download 同一套口径，两处必须一致）：
//   1. 必须有登录会话；
//   2. 必须已开通卫星云盘（存在 B2Account）；
//   3. key 必须落在自己的 keyPrefix 之下 —— 不满足直接 403，绝不"先执行再校验"。
//
// 为什么不用平台主密钥列目录：用户受限密钥本身就带 namePrefix 与最小 capabilities，
// 即便这里的前缀校验被绕过，B2 侧也只看得见它自己那一段。两层防护，任一失效都不致命。
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

function log(level: 'info' | 'warn' | 'error', event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'b2-objects', event, ...extra });
  if (level === 'error') console.error(line);
  else console.log(line);
}

/** 取出「已登录 + 已开通云盘」的账户；任一不满足返回 NextResponse（调用方直接 return） */
async function resolveAccount(req: NextRequest) {
  let sessionUser: { id: number } | null = null;
  try {
    const session = await import('@/lib/session');
    sessionUser = await session.getSessionUser(req);
  } catch {
    /* 下方统一处理 */
  }
  if (!sessionUser) {
    return { error: NextResponse.json({ success: false, error: '请先刷脸登录' }, { status: 401 }) } as const;
  }
  const ledger = await import('@/lib/ledger');
  const account = await ledger.prisma.b2Account.findUnique({ where: { userId: sessionUser.id } });
  if (!account) {
    return { error: NextResponse.json({ success: false, error: '尚未开通卫星云盘' }, { status: 403 }) } as const;
  }
  return { account } as const;
}

export async function GET(req: NextRequest) {
  const resolved = await resolveAccount(req);
  if ('error' in resolved) return resolved.error;
  const { account } = resolved;

  try {
    const b2 = await import('@/lib/b2');
    const objects = await b2.listUserObjects(
      { keyId: account.keyId, appKey: account.applicationKey },
      account.bucket,
      account.keyPrefix,
    );
    const totalBytes = objects.reduce((sum, o) => sum + o.size, 0);
    log('info', 'list_ok', { userId: account.userId, count: objects.length, totalBytes });
    return NextResponse.json({
      success: true,
      bucket: account.bucket,
      keyPrefix: account.keyPrefix,
      lifecycle: b2.LIFECYCLE,
      objects,
      totalBytes,
    });
  } catch (e) {
    log('error', 'list_failed', { error: (e as Error)?.message });
    return NextResponse.json(
      { success: false, error: `读取云盘失败：${(e as Error)?.message ?? '未知错误'}` },
      { status: 502 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const resolved = await resolveAccount(req);
  if ('error' in resolved) return resolved.error;
  const { account } = resolved;

  const key = (req.nextUrl.searchParams.get('key') ?? '').slice(0, 300);
  if (!key) {
    return NextResponse.json({ success: false, error: '缺少文件 key' }, { status: 400 });
  }
  // 防越权：先校验再执行
  if (!key.startsWith(account.keyPrefix)) {
    log('warn', 'delete_forbidden', { userId: account.userId });
    return NextResponse.json({ success: false, error: '无权删除该文件' }, { status: 403 });
  }

  try {
    const b2 = await import('@/lib/b2');
    await b2.deleteUserObject({ keyId: account.keyId, appKey: account.applicationKey }, account.bucket, key);
    log('info', 'delete_ok', { userId: account.userId });
    return NextResponse.json({ success: true, key });
  } catch (e) {
    log('error', 'delete_failed', { error: (e as Error)?.message });
    return NextResponse.json(
      { success: false, error: `删除失败：${(e as Error)?.message ?? '未知错误'}` },
      { status: 502 },
    );
  }
}
