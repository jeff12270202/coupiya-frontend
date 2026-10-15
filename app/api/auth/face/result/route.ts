// ============================================================================
// app/api/auth/face/result/route.ts —— 查询刷脸核身结果（轮询）· 注册模式 v2
// ----------------------------------------------------------------------------
// 规则（用户澄清版 v2）：
//   - 人脸识别只用于【首次注册】；
//   - 注册完成后必须【设置强密码】（username + password）；
//   - 以后登录直接用 账号+密码，不再需要人脸识别。
// 契约（与 components/FaceAuthModal.tsx 一致）：
//   202: { status: 'pending' }
//   200: { status: 'exists', message }              // 该人脸已注册过（请密码登录）
//   200: { status: 'success', user: AuthUser }       // 新注册（needsPassword 视补设状态）
//   200: { status: 'failed' }
//   4xx: { error }
// 新注册成功即签发会话（便于随后补设密码）；needsPassword=true 时前端必须引导
// 设置密码，设置完成前账号不可用于密码登录。
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

function toUserShape(user: {
  id: number;
  nickname: string | null;
  avatar: string | null;
  balance: number;
  status: string;
  username: string | null;
  passwordSetAt: Date | null;
}) {
  return {
    id: user.id,
    nickname: user.nickname || `创作者 ${user.id}`,
    avatar: user.avatar ?? undefined,
    username: user.username ?? undefined,
    balance: user.balance,
    isFrozen: user.status === 'frozen',
    needsPassword: !user.passwordSetAt,
  };
}

export async function GET(req: NextRequest) {
  const requestId = makeRequestId();
  const ticket = (req.nextUrl.searchParams.get('ticket') ?? '').trim();
  if (!ticket || ticket.length > 500) {
    return err('ERR_VALIDATION', '缺少有效的核身令牌', 400, requestId);
  }

  try {
    const faceid = await import('@/lib/faceid');
    const result = await faceid.queryFaceResult(ticket);

    if (result.status === 'pending') {
      return NextResponse.json({ status: 'pending' }, { status: 202 });
    }
    if (result.status === 'failed' || !result.faceId) {
      return NextResponse.json({ status: 'failed' });
    }

    const ledger = await import('@/lib/ledger');
    const prisma = ledger.prisma;

    // ---- 已有人脸账号 ----
    const existing = await prisma.user.findUnique({ where: { faceId: result.faceId } });
    if (existing) {
      // 已注册且已设置密码 → 引导密码登录（人脸不再作为登录方式）
      if (existing.passwordSetAt) {
        return NextResponse.json({
          status: 'exists',
          message: '该人脸已完成注册，请使用 账号 + 密码 登录。',
          requestId,
        });
      }
      // 存在但从未设置密码（历史遗留）→ 视为注册续办：签发会话补设密码
      const session = await import('@/lib/session');
      const res = NextResponse.json({ status: 'success', user: toUserShape(existing), requestId });
      session.setSessionCookie(res, existing.id);
      return res;
    }

    // ---- 新注册：faceId 唯一建号 → 签发会话 → 强制补设强密码 ----
    const user = await prisma.user.create({
      data: {
        faceId: result.faceId,
        nickname: `创作者${String(Math.floor(1000 + Math.random() * 9000))}`,
        balance: 0,
      },
      select: {
        id: true, nickname: true, avatar: true, balance: true, status: true,
        username: true, passwordSetAt: true,
      },
    });

    const session = await import('@/lib/session');
    const res = NextResponse.json({ status: 'success', user: toUserShape(user), requestId });
    session.setSessionCookie(res, user.id);

    console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', svc: 'face-result', requestId, event: 'face_registered', userId: user.id }));
    return res;
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', svc: 'face-result', requestId, event: 'face_result_failed', error: (e as Error)?.message }));
    return err('ERR_UPSTREAM', `查询核身结果失败：${(e as Error)?.message ?? '未知错误'}`, 502, requestId);
  }
}
