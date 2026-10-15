// ============================================================================
// app/api/paypal/create-order/route.ts —— PayPal 充值下单（Orders v2）
// ----------------------------------------------------------------------------
// 流程（SOP 14）：登录用户选套餐 → 本接口校验金额 → 建平台订单（pending）
//   → 调 PayPal Orders v2 创建订单（intent=CAPTURE，custom_id 关联平台订单）
//   → 返回 paypalOrderId / credits / clientId（前端可接 @paypal/react-paypal-js）。
// 安全：金额白名单；custom_id 为平台订单标识，捕获时校验归属。
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
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'paypal-create-order', requestId, event, ...extra });
  if (level === 'error') console.error(line);
  else console.log(line);
}

function err(code: string, message: string, status: number, requestId: string) {
  return NextResponse.json({ success: false, code, message, requestId }, { status });
}

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();

  // ---- 登录会话（充值必须登录） ----
  let sessionUser: { id: number } | null = null;
  try {
    const session = await import('@/lib/session');
    sessionUser = await session.getSessionUser(req);
  } catch {
    /* 下方统一处理 */
  }
  if (!sessionUser) return err('ERR_AUTH', '请先刷脸登录后再充值', 401, requestId);

  // ---- 金额白名单 ----
  let amountUsd = 0;
  try {
    const body = (await req.json()) as { amountUsd?: unknown };
    amountUsd = Number(body.amountUsd);
  } catch {
    return err('ERR_VALIDATION', '请求体必须是 JSON', 400, requestId);
  }
  const payments = await import('@/lib/payments');
  if (!Number.isFinite(amountUsd) || !payments.isAllowedAmount(amountUsd)) {
    return err('ERR_VALIDATION', `金额必须在 ${payments.ALLOWED_AMOUNTS_USD.join(' / ')} 美元之一`, 400, requestId);
  }

  if (!CFG.clientId || !CFG.secret) {
    return err('ERR_CONFIG', 'PayPal 凭证未配置（PAYPAL_CLIENT_ID / PAYPAL_SECRET）', 503, requestId);
  }

  // ---- 平台订单 ----
  const order = await payments.createRechargeOrder({ userId: sessionUser.id, provider: 'paypal', amountUsd });
  const customId = `cp-${order.id}`;

  // ---- PayPal Orders v2 下单 ----
  try {
    const auth = Buffer.from(`${CFG.clientId}:${CFG.secret}`).toString('base64');
    const siteBase = (process.env.NEXT_PUBLIC_URL || 'https://coupiya.com').replace(/\/+$/, '');
    const res = await fetch(`${paypalBase()}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: customId,
            custom_id: customId,
            amount: { currency_code: 'USD', value: amountUsd.toFixed(2) },
          },
        ],
        application_context: {
          brand_name: 'Coupiya',
          user_action: 'PAY_NOW',
          return_url: `${siteBase}/recharge?paypal=success`,
          cancel_url: `${siteBase}/recharge?paypal=cancel`,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
      links?: Array<{ href?: string; rel?: string }>;
    };
    if (!res.ok || !data.id) {
      log('error', requestId, 'paypal_create_failed', { status: res.status });
      return err('ERR_UPSTREAM', 'PayPal 下单失败，请稍后重试', 502, requestId);
    }

    await payments.bindProviderOrderId(order.id, data.id);
    // 提取 approve 跳转链接（服务端重定向流；也可改用 @paypal/react-paypal-js 的 JS SDK 流）
    const approveUrl = data.links?.find((l) => l.rel === 'approve')?.href ?? '';
    log('info', requestId, 'paypal_order_created', { userId: sessionUser.id, amountUsd, paypalOrderId: data.id });
    return NextResponse.json({
      success: true,
      paypalOrderId: data.id,
      amountUsd,
      credits: payments.creditsForUsd(amountUsd),
      approveUrl,
      clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || CFG.clientId,
      requestId,
    });
  } catch (e) {
    log('error', requestId, 'paypal_create_error', { error: (e as Error)?.message });
    return err('ERR_UPSTREAM', 'PayPal 下单失败，请稍后重试', 502, requestId);
  }
}
