// ============================================================================
// app/api/satellite/onboard/route.ts —— 开通卫星服务 → 自动配置专属 B2 空间
// ----------------------------------------------------------------------------
// 流程（登录必填，本服务免费开通，符合全站开放原则）：
//   会话鉴权 → 幂等检查（已开通直接返回）→ 平台主密钥建桶(私有+CORS)
//   → 受限密钥(namePrefix 隔离) → 密钥密存入库（绝不下发前端）
// 环境变量（服务端，禁止 VITE_ 前缀）：
//   B2_APPLICATION_KEY_ID / B2_APPLICATION_KEY / B2_ENDPOINT / B2_REGION / B2_API_BASE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function makeRequestId(): string {
  return crypto.randomUUID();
}

function log(level: 'info' | 'error', requestId: string, event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'satellite-onboard', requestId, event, ...extra });
  if (level === 'error') console.error(line);
  else console.log(line);
}

function err(code: string, message: string, status: number, requestId: string) {
  return NextResponse.json({ success: false, code, message, requestId }, { status });
}

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();

  let sessionUser: { id: number } | null = null;
  try {
    const session = await import('@/lib/session');
    sessionUser = await session.getSessionUser(req);
  } catch {
    /* 下方统一处理 */
  }
  if (!sessionUser) return err('ERR_AUTH', '请先刷脸登录后开通卫星云盘服务', 401, requestId);

  // ---- 平台 B2 凭证检查（fail-closed） ----
  try {
    const b2 = await import('@/lib/b2');
    if (!b2.b2Configured()) {
      return err('ERR_CONFIG', 'B2 平台凭证未配置（B2_APPLICATION_KEY_ID / B2_APPLICATION_KEY，服务端环境变量）', 503, requestId);
    }

    const ledger = await import('@/lib/ledger');
    const prisma = ledger.prisma;

    // ---- 幂等：已开通直接返回 ----
    const existing = await prisma.b2Account.findUnique({ where: { userId: sessionUser.id } });
    if (existing) {
      log('info', requestId, 'onboard_already', { userId: sessionUser.id, bucket: existing.bucket });
      return NextResponse.json({
        success: true,
        already: true,
        bucket: existing.bucket,
        keyPrefix: existing.keyPrefix,
        createdAt: existing.createdAt.toISOString(),
        requestId,
      });
    }

    // ---- 建桶 + 受限密钥 ----
    const space = await b2.createUserB2Space(sessionUser.id);

    const account = await prisma.b2Account.create({
      data: {
        userId: sessionUser.id,
        bucket: space.bucket,
        bucketId: space.bucketId,
        keyId: space.keyId,
        applicationKey: space.applicationKey, // 服务端密存；前端永远拿不到
        keyPrefix: space.keyPrefix,
      },
    });

    log('info', requestId, 'onboard_ok', { userId: sessionUser.id, bucket: space.bucket, keyPrefix: space.keyPrefix });
    return NextResponse.json({
      success: true,
      already: false,
      bucket: account.bucket,
      keyPrefix: account.keyPrefix,
      createdAt: account.createdAt.toISOString(),
      warnings: ['B2 CORS 规则已写入，全球边缘节点生效约需 10-15 分钟；期间直传可能被浏览器拦截'],
      requestId,
    });
  } catch (e) {
    log('error', requestId, 'onboard_failed', { error: (e as Error)?.message });
    return err('ERR_UPSTREAM', `开通失败：${(e as Error)?.message ?? '未知错误'}`, 502, requestId);
  }
}
