// ============================================================================
// app/api/payment/webhook/paypal/route.ts —— PayPal Webhook（必须验签 + 幂等）
// ----------------------------------------------------------------------------
// 配置（SOP 16）：PayPal 开发者后台将本 URL 注册为 Webhook，
//   生产：https://api.coupiya.com/api/payment/webhook/paypal
// 验签：调用 PayPal verify-webhook-signature 接口，SUCCESS 才处理；
// 幂等：settleRechargeOrder 按 provider_order_id 保证只到账一次；
// 任何情况都返回 200（避免 PayPal 无限重试），失败记日志人工对账。
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CFG = {
  clientId: process.env.PAYPAL_CLIENT_ID || '',
  secret: process.env.PAYPAL_SECRET || '',
  webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
  mode: process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox',
};

function paypalBase(): string {
  return CFG.mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

function log(level: 'info' | 'warn' | 'error', event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'paypal-webhook', event, ...extra });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // ---- 配置检查 ----
  if (!CFG.clientId || !CFG.secret || !CFG.webhookId) {
    log('error', 'webhook_not_configured');
    return NextResponse.json({ success: false }, { status: 500 });
  }

  const headers = {
    'transmission-id': req.headers.get('paypal-transmission-id') ?? '',
    'transmission-time': req.headers.get('paypal-transmission-time') ?? '',
    'cert-url': req.headers.get('paypal-cert-url') ?? '',
    'auth-algo': req.headers.get('paypal-auth-algo') ?? '',
    'transmission-sig': req.headers.get('paypal-transmission-sig') ?? '',
  };
  if (Object.values(headers).some((v) => !v)) {
    log('warn', 'webhook_headers_missing');
    return NextResponse.json({ success: false }, { status: 200 });
  }

  // ---- 验签（Webhook 签名校验，防伪造刷余额） ----
  try {
    const verifyRes = await fetch(`${paypalBase()}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${CFG.clientId}:${CFG.secret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_algo: headers['auth-algo'],
        cert_url: headers['cert-url'],
        transmission_id: headers['transmission-id'],
        transmission_sig: headers['transmission-sig'],
        transmission_time: headers['transmission-time'],
        webhook_id: CFG.webhookId,
        webhook_event: JSON.parse(rawBody),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const verifyData = (await verifyRes.json().catch(() => ({}))) as { verification_status?: string };
    if (verifyData.verification_status !== 'SUCCESS') {
      log('error', 'webhook_verify_failed', { verification_status: verifyData.verification_status });
      return NextResponse.json({ success: false }, { status: 200 });
    }
  } catch (e) {
    log('error', 'webhook_verify_error', { error: (e as Error)?.message });
    return NextResponse.json({ success: false }, { status: 200 });
  }
  const event = JSON.parse(rawBody) as {
    event_type?: string;
    resource?: { custom_id?: string; id?: string };
  };

  // ---- 仅处理捕获完成事件 ----
  if (event?.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
    return NextResponse.json({ success: true }, { status: 200 });
  }
  const customId = String(event.resource?.custom_id ?? '');
  const match = /^cp-(\d+)$/.exec(customId);
  if (!match) {
    log('warn', 'webhook_custom_id_missing');
    return NextResponse.json({ success: true }, { status: 200 });
  }

  // ---- 幂等到账（providerOrderId 在下单时已回写；缺失时用事件资源 id 兜底） ----
  try {
    const payments = await import('@/lib/payments');
    const ledger = await import('@/lib/ledger');
    const order = await ledger.prisma.rechargeOrder.findUnique({ where: { id: Number(match[1]) } });
    if (!order) {
      log('warn', 'webhook_order_not_found', { customId });
      return NextResponse.json({ success: true }, { status: 200 });
    }
    const providerOrderId =
      order.providerOrderId || String(event.resource?.id ?? '');
    if (!providerOrderId) {
      log('warn', 'webhook_provider_order_id_missing', { customId });
      return NextResponse.json({ success: true }, { status: 200 });
    }
    const settled = await payments.settleRechargeOrder(providerOrderId, 'paypal');
    log('info', 'webhook_settled', { customId, already: settled.already });
  } catch (e) {
    log('error', 'webhook_settle_error', { error: (e as Error)?.message });
  }
  return NextResponse.json({ success: true }, { status: 200 });
}
