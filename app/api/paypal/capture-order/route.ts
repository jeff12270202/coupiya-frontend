// ============================================================================
// app/api/paypal/capture-order/route.ts —— PayPal 捕获订单（前端支付成功后调用）
// ----------------------------------------------------------------------------
// 流程（SOP 15）：前端完成支付 → 本接口 CAPTURE → 校验金额与 custom_id 归属
//   → settleRechargeOrder 幂等到账（事务双写）→ 返回最新余额。
// 安全：capture 成功后二次核验金额；custom_id 必须对应当前登录用户自己的订单。
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const CFG = {
  clientId: process.env.PAYPAL_CLIENT_ID || '',
  secret: process.env.PAYPAL_SECRET || '',
  mode: process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox',
};

function paypalBase(): string {
  return CFG.mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

function makeRequestId(): string {
  return crypto.randomUUID();
}

function log(level: 'info' | 'warn' | 'error', requestId: string, event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'paypal-capture', requestId, event, ...extra });
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
  if (!sessionUser) return err('ERR_AUTH', '请先刷脸登录', 401, requestId);

  let paypalOrderId = '';
  try {
    const body = (await req.json()) as { orderId?: unknown };
    paypalOrderId = String(body.orderId ?? '').trim();
  } catch {
    return err('ERR_VALIDATION', '请求体必须是 JSON', 400, requestId);
  }
  if (!paypalOrderId || paypalOrderId.length > 64) {
    return err('ERR_VALIDATION', '缺少有效的 PayPal 订单号', 400, requestId);
  }

  if (!CFG.clientId || !CFG.secret) {
    return err('ERR_CONFIG', 'PayPal 凭证未配置', 503, requestId);
  }

  try {
    const auth = Buffer.from(`${CFG.clientId}:${CFG.secret}`).toString('base64');
    const res = await fetch(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      custom_id?: string;
      purchase_units?: Array<{ payments?: { captures?: Array<{ amount?: { value?: string } }> } }>;
    };
    if (!res.ok || data.status !== 'COMPLETED') {
      log('warn', requestId, 'paypal_capture_not_completed', { status: data.status ?? res.status });
      return err('ERR_UPSTREAM', '支付未完成，请重试', 402, requestId);
    }

    // ---- 归属与金额核验（custom_id = cp-<平台订单id>） ----
    const customId = String(data.custom_id ?? '');
    const match = /^cp-(\d+)$/.exec(customId);
    if (!match) {
      log('error', requestId, 'paypal_custom_id_invalid', { customId });
      return err('ERR_VALIDATION', '订单归属异常，请联系客服', 400, requestId);
    }

    const payments = await import('@/lib/payments');
    const ledger = await import('@/lib/ledger');
    const order = await ledger.prisma.rechargeOrder.findUnique({
      where: { id: Number(match[1]) },
    });
    if (!order || order.provider !== 'paypal' || order.userId !== sessionUser.id) {
      return err('ERR_AUTH', '订单不属于当前用户', 403, requestId);
    }

    // 捕获金额与订单金额核对（防篡改）
    const captured = Number(data.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? -1);
    if (Math.abs(captured - order.amountUsd) > 0.01) {
      log('error', requestId, 'paypal_amount_mismatch', { expected: order.amountUsd, captured });
      return err('ERR_VALIDATION', '支付金额与订单不符，请联系客服', 400, requestId);
    }

    const settled = await payments.settleRechargeOrder(paypalOrderId, 'paypal');
    if (!settled.ok) return err('ERR_LEDGER', '到账处理失败，请联系客服', 503, requestId);

    const balance = await ledger.getBalance(sessionUser.id).catch(() => 0);
    log('info', requestId, 'paypal_captured', { userId: sessionUser.id, orderId: order.id, credits: order.credits });
    return NextResponse.json({
      success: true,
      credits: order.credits,
      balance,
      already: settled.already,
      requestId,
    });
  } catch (e) {
    log('error', requestId, 'paypal_capture_error', { error: (e as Error)?.message });
    return err('ERR_UPSTREAM', '确认支付失败，请稍后重试', 502, requestId);
  }
}
