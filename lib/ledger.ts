// ============================================================================
// lib/ledger.ts —— 用户积分账本（Credits 余额系统核心）
// 适配 Prisma 6（最稳定版本，无需 adapter）
// ============================================================================

import { PrismaClient } from '@prisma/client';

// Next.js dev 热重载时复用单例，避免连接池耗尽
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma 6 会自动从 schema.prisma 的 env("DATABASE_URL") 读取连接
export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type TransactionType = 'recharge' | 'consume' | 'refund' | 'rebate';

/** 查询余额 */
export async function getBalance(userId: number): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { balance: true } });
  if (!user) throw new Error('USER_NOT_FOUND');
  return user.balance;
}

/**
 * 扣费（事务双写：余额 - amount，写流水 type=consume）
 */
export async function deductCredits(
  userId: number,
  amount: number,
  reason: string,
  relatedId?: string,
): Promise<{ ok: boolean; balance: number }> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('USER_NOT_FOUND');
    if (user.balance < amount) return { ok: false, balance: user.balance };

    const updated = await tx.user.update({
      where: { id: userId },
      data: { balance: { decrement: amount } },
    });
    await tx.creditTransaction.create({
      data: {
        userId,
        type: 'consume',
        amount: -amount,
        balanceAfter: updated.balance,
        reason,
        relatedId: relatedId ?? null,
      },
    });
    return { ok: true, balance: updated.balance };
  });
}

/** 加余额（充值/退款/多退少补，事务双写） */
export async function addCredits(
  userId: number,
  amount: number,
  type: TransactionType,
  reason: string,
  relatedId?: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('USER_NOT_FOUND');
    const updated = await tx.user.update({
      where: { id: userId },
      data: { balance: { increment: amount } },
    });
    await tx.creditTransaction.create({
      data: {
        userId,
        type,
        amount,
        balanceAfter: updated.balance,
        reason,
        relatedId: relatedId ?? null,
      },
    });
    return updated.balance;
  });
}

/**
 * ============================================================================
 * 【配套】Prisma schema（prisma/schema.prisma 追加以下内容后执行迁移）
 * ============================================================================
 *
 * model User {
 *   id        Int      @id @default(autoincrement())
 *   faceId    String?  @unique          // 腾讯云人脸核身唯一 ID（刷脸注册）
 *   nickname  String   @default("创作者")
 *   avatar    String?
 *   balance   Int      @default(0)      // Credits 余额
 *   status    String   @default("active") // active / frozen / debt
 *   createdAt DateTime @default(now())
 *   updatedAt DateTime @updatedAt
 *   transactions CreditTransaction[]
 * }
 *
 * model CreditTransaction {
 *   id           Int      @id @default(autoincrement())
 *   userId       Int
 *   user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
 *   type         String   // recharge / consume / refund / rebate
 *   amount       Int      // 正=加 负=扣
 *   balanceAfter Int
 *   reason       String
 *   relatedId    String?  // 关联订单/任务 ID，便于对账
 *   createdAt    DateTime @default(now())
 *
 *   @@index([userId, createdAt])
 * }
 */
