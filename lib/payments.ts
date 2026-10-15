// ============================================================================
// lib/payments.ts —— 充值订单 + Credits 到账（共享账务层，支付路由统一调用）
// ----------------------------------------------------------------------------
// 对应 SOP 第 12/15/16/17/24/25 项：
//   - recharge_orders 订单表：user_id / 金额 / 币种 / credits / provider /
//     provider_order_id / status(pending|completed|failed)
//   - 到账=事务双写：订单置 completed + 余额递增 + 流水（balanceAfter 真实值），
//     与 lib/ledger.ts 同一套原子语义
//   - 幂等：updateMany where status='pending' 保证同一订单只到账一次（Webhook
//     重试 / 并发回调安全）；already=true 表示此前已到账
//   - 定价锚点：$1 = 100 Credits（SOP 19 固定锚点，不随成本波动）
// ============================================================================

import { prisma } from './ledger';

/** $1 = 100 Credits 固定锚点（SOP 19） */
export const CREDITS_PER_USD = 100;

/** 允许的充值套餐（美元），与前端展示一致 */
export const ALLOWED_AMOUNTS_USD = [5, 10, 25, 50];

export function creditsForUsd(amountUsd: number): number {
  return Math.round(amountUsd * CREDITS_PER_USD);
}

export function isAllowedAmount(amountUsd: number): boolean {
  return ALLOWED_AMOUNTS_USD.includes(amountUsd);
}

/**
 * 创建充值订单（pending）。
 * @param provider paypal | worldfirst
 * @param providerOrderId 渠道侧订单号（可后补，下单成功后 bindProviderOrderId）
 */
export async function createRechargeOrder(params: {
  userId: number;
  provider: string;
  amountUsd: number;
  currency?: string;
}): Promise<{ id: number }> {
  const credits = creditsForUsd(params.amountUsd);
  return prisma.rechargeOrder.create({
    data: {
      userId: params.userId,
      provider: params.provider,
      amountUsd: params.amountUsd,
      currency: params.currency ?? 'USD',
      credits,
      status: 'pending',
    },
    select: { id: true },
  });
}

/** 订单补记渠道订单号 */
export async function bindProviderOrderId(orderId: number, providerOrderId: string): Promise<void> {
  await prisma.rechargeOrder.update({
    where: { id: orderId },
    data: { providerOrderId },
  });
}

/**
 * 渠道确认收款后到账（事务双写 + 幂等）。
 * 返回 { ok, already, userId?, credits? } —— already=true 表示此前已到账。
 */
export async function settleRechargeOrder(
  providerOrderId: string,
  provider: string,
): Promise<{ ok: boolean; already: boolean; userId?: number; credits?: number }> {
  const order = await prisma.rechargeOrder.findFirst({
    where: { providerOrderId, provider },
  });
  if (!order) return { ok: false, already: false };

  // 已到账（幂等短路）
  if (order.status === 'completed') {
    return { ok: true, already: true, userId: order.userId, credits: order.credits };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 行级安全：仅 pending → completed；并发下只有一方成功
      const updated = await tx.rechargeOrder.updateMany({
        where: { id: order.id, status: 'pending' },
        data: { status: 'completed', completedAt: new Date() },
      });
      if (updated.count === 0) return { already: true };

      const user = await tx.user.update({
        where: { id: order.userId },
        data: { balance: { increment: order.credits } },
      });
      await tx.creditTransaction.create({
        data: {
          userId: order.userId,
          type: 'recharge',
          amount: order.credits,
          balanceAfter: user.balance,
          reason: `充值到账 ${provider} ${order.amountUsd} ${order.currency}`,
          relatedId: String(order.id),
        },
      });
      return { already: false };
    });
    return { ok: true, already: result.already, userId: order.userId, credits: order.credits };
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', svc: 'payments', event: 'settle_failed', providerOrderId, error: (e as Error)?.message }));
    return { ok: false, already: false };
  }
}

/* ============================================================================
 * 【配套】Prisma schema（prisma/schema.prisma 追加后执行迁移）
 * ============================================================================
 * model RechargeOrder {
 *   id               Int      @id @default(autoincrement())
 *   userId           Int
 *   provider         String   // paypal / worldfirst
 *   providerOrderId  String?  @unique   // 渠道订单号（唯一，幂等依据）
 *   amountUsd        Float
 *   currency         String   @default("USD")
 *   credits          Int                 // 到账 Credits = amountUsd × 100
 *   status           String   @default("pending") // pending / completed / failed
 *   completedAt      DateTime?
 *   createdAt        DateTime @default(now())
 *
 *   @@index([userId, createdAt])
 *   @@index([provider, status])
 * }
 */
