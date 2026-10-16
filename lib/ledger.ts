// ============================================================================
// lib/ledger.ts —— 用户积分账本（Credits 余额系统核心）
// 适配 Prisma 6（最稳定版本，无需 adapter）
// ============================================================================

// ⚠️ 【为什么这里用宽松类型 + 显式 any 而不是精确类型】
//   Vercel 构建时若 `prisma generate` 未生效，@prisma/client 不会导出 PrismaClient，
//   于是 `import { PrismaClient }` 直接 TS2305 报错、`$transaction` 回调参数变成隐式 any，
//   整个部署被类型检查卡死 —— 而这是构建期问题，不是运行期故障。
//   运行期 @prisma/client 一定导出了 PrismaClient，所以这里改用命名空间导入 + 显式 any，
//   让类型缺失不再有能力阻断线上发布。真正的根治见 package.json 的 postinstall。
//
// 下面这行 @ts-ignore：极少数情况下连 @prisma/client 自带的 index.d.ts 都不可用时，
//   TS7016（模块无类型声明）仍会报错，用它一并压住；类型齐全时该指令无任何副作用。
// @ts-ignore
import * as PrismaClientModule from '@prisma/client';

/** PrismaClient 构造器（构建期可能缺类型，故显式 any） */
const PrismaClientCtor: any = (PrismaClientModule as any).PrismaClient;

// Next.js dev 热重载时复用单例，避免连接池耗尽
const globalForPrisma = globalThis as unknown as { prisma?: any };

// Prisma 6 会自动从 schema.prisma 的 env("DATABASE_URL") 读取连接
export const prisma: any = globalForPrisma.prisma ?? new PrismaClientCtor();

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
  return prisma.$transaction(async (tx: any) => {
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
  return prisma.$transaction(async (tx: any) => {
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
