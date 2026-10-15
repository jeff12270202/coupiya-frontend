// ============================================================================
// app/api/payment/webhook/worldfirst/route.ts —— 万里汇 Webhook（必须验签 + 幂等）
// ----------------------------------------------------------------------------
// 配置（SOP 17）：万里汇后台将回调 URL 指向
//   生产：https://api.coupiya.com/api/payment/webhook/worldfirst
// 验签：按万里汇文档的签名算法对【原始请求体】验签（本文件按
//   HMAC-SHA256(rawBody, WORLDFIRST_API_KEY) 实现占位，⚠️ 以官方文档为准），
//   验签失败拒绝处理并记日志（防伪造刷余额）。
// 幂等：settleRechargeOrder 按 provider_order_id 保证只到账一次。
// ============================================================================

import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CFG = {
  apiKey: process.env.WORLDFIRST_API_KEY || '',
  /** 签名头名称（⚠️ 以万里汇文档为准） */
  signatureHeader: process.env.WORLDFIRST_SIGNATURE_HEADER || 'x-signature',
};

function log(level: 'info' | 'warn' | 'error', event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'worldfirst-webhook', event, ...extra });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!CFG.apiKey) {
    log('error', 'webhook_not_configured');
    return NextResponse.json({ success: false }, { status: 500 });
  }

  // ---- 验签（防伪造；算法占位，⚠️ 以官方文档为准） ----
  const signature = req.headers.get(CFG.signatureHeader) ?? '';
  if (!signature) {
    log('warn', 'webhook_signature_missing');
    return NextResponse.json({ success: false }, { status: 200 });
  }
  const expected = createHmac('sha256', CFG.apiKey).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(signature.toLowerCase());
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    log('error', 'webhook_signature_invalid');
    return NextResponse.json({ success: false }, { status: 200 });
  }

  // ---- 解析事件（⚠️ 字段名以万里汇文档为准） ----
  let event: { order_id?: string; out_order_no?: string; status?: string };
  try {
    event = JSON.parse(rawBody) as { order_id?: string; out_order_no?: string; status?: string };
  } catch {
    log('error', 'webhook_body_not_json');
    return NextResponse.json({ success: false }, { status: 200 });
  }

  const statusText = String(event.status ?? '').toLowerCase();
  if (!['success', 'paid', 'completed', 'succeeded'].includes(statusText)) {
    log('info', 'webhook_ignored', { status: statusText });
    return NextResponse.json({ success: true }, { status: 200 });
  }

  const providerOrderId = String(event.order_id ?? '');
  if (!providerOrderId) {
    log('warn', 'webhook_order_id_missing');
    return NextResponse.json({ success: true }, { status: 200 });
  }

  // ---- 幂等到账 ----
  try {
    const payments = await import('@/lib/payments');
    const settled = await payments.settleRechargeOrder(providerOrderId, 'worldfirst');
    log('info', 'webhook_settled', { providerOrderId, already: settled.already });
  } catch (e) {
    log('error', 'webhook_settle_error', { error: (e as Error)?.message });
  }
  return NextResponse.json({ success: true }, { status: 200 });
}
