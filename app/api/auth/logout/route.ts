// ============================================================================
// app/api/auth/logout/route.ts —— 注销登录（清除会话 Cookie）
// ============================================================================

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ success: true });
  const session = await import('@/lib/session');
  session.clearSessionCookie(res);
  return res;
}
