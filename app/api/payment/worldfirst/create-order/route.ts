// ============================================================================
// app/api/payment/worldfirst/create-order/route.ts —— 万里汇（WorldFirst）充值下单
// ----------------------------------------------------------------------------
// 流程（SOP 17）：登录用户选套餐 → 建平台订单（pending）→ 调万里汇 OpenAPI
//   创建收款订单 → 返回 payment_url（前端 window.open 跳安全支付页）。
// ⚠️ 待核对（SOP 28）：万里汇 OpenAPI 的准确端点 / 鉴权方式 / 下单字段名以
//   万里汇开发者中心文档为准（open-sea.worldfirst.com 或跨境收款后台提供），
//   本文件用环境变量收敛，字段不符时按文档调整并保持 fail-closed。
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const CFG = {
  apiBase: (process.env.WORLDFIRST_API_BASE || 'https://open-sea.worldfirst.com').replace(/\/+$/, ''),
  merchantId: process.env.WORLDFIRST_MERCHANT_ID || '',
  clientId: process.env.WORLDFIRST_CLIENT_ID || '',
  apiKey: process.env.WORLDFIRST_API_KEY || '', // 签名/鉴权密钥
  accessToken: process.env.WORLDFIRST_ACCESS_TOKEN || '', // 如有独立 token 机制
  mode: process.env.WORLDFIRST_MODE === 'sandbox' ? 'sandbox' : 'production',
};

function makeRequestId(): string {
  return crypto.randomUUID();
}

function log(level: 'info' | 'warn' | 'error', requestId: string, event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'worldfirst-create-order', requestId, event, ...extra });
  if (level === 'error') console.error(line);
  else console.log(line);
}

function err(code: string, message: string, status: number, requestId: string) {
  return NextResponse.json({ success: false, code, message, requestId }, { status });
}

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();

  // ---- 登录会话 ----
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

  // ---- 配置校验（企业主体入驻后配置） ----
  if (!CFG.merchantId || !CFG.clientId || !CFG.apiKey) {
    return err('ERR_CONFIG', '万里汇商户配置缺失（WORLDFIRST_MERCHANT_ID / CLIENT_ID / API_KEY）', 503, requestId);
  }

  // ---- 平台订单 ----
  const order = await payments.createRechargeOrder({ userId: sessionUser.id, provider: 'worldfirst', amountUsd });
  const outOrderNo = `wf-${order.id}-${Date.now()}`;

  // ---- 调用万里汇创建收款订单（⚠️ 字段名以官方文档为准） ----
  try {
    const callbackUrl = `${process.env.NEXT_PUBLIC_API_URL || 'https://api.coupiya.com'}/api/payment/webhook/worldfirst`;
    const res = await fetch(`${CFG.apiBase}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Merchant-Id': CFG.merchantId,
        'X-Client-Id': CFG.clientId,
        'X-Access-Token': CFG.accessToken,
        'X-Signature': CFG.apiKey, // ⚠️ 实际为签名算法结果，见文档；此处占位防误用
      },
      body: JSON.stringify({
        out_order_no: outOrderNo,
        merchant_id: CFG.merchantId,
        amount: { value: amountUsd.toFixed(2), currency: 'USD' },
        description: `Coupiya Credits 充值 $${amountUsd}`,
        callback_url: callbackUrl,
        notify_url: callbackUrl,
        client_ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { payment_url?: string; order_id?: string; code?: string; message?: string };
    if (!res.ok || !data.payment_url) {
      log('error', requestId, 'worldfirst_create_failed', { status: res.status, message: data.message ?? data.code });
      return err('ERR_UPSTREAM', '万里汇下单失败，请稍后重试', 502, requestId);
    }

    if (data.order_id) await payments.bindProviderOrderId(order.id, data.order_id);
    log('info', requestId, 'worldfirst_order_created', { userId: sessionUser.id, amountUsd, outOrderNo });
    return NextResponse.json({
      success: true,
      paymentUrl: data.payment_url,
      outOrderNo,
      amountUsd,
      credits: payments.creditsForUsd(amountUsd),
      requestId,
    });
  } catch (e) {
    log('error', requestId, 'worldfirst_create_error', { error: (e as Error)?.message });
    return err('ERR_UPSTREAM', '万里汇下单失败，请稍后重试', 502, requestId);
  }
}
