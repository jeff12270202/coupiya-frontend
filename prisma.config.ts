import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';
import path from 'path';

// 确保 Prisma CLI 能加载 .env 中的变量（文件不存在时 dotenv 静默跳过，不报错）
config({ path: path.resolve(process.cwd(), '.env') });

/**
 * ⚠️ 这里刻意用 process.env 而不是 prisma/config 的 env()。
 *
 * env('DATABASE_URL') 在变量缺失时会【抛错】，而 Vercel 构建环境通常没有
 * DATABASE_URL（那是运行期才需要的）。一旦抛错，package.json 的 postinstall
 * （prisma generate）就会失败 → npm install 失败 → 整个部署中断。
 * 而 prisma generate 本身【不需要真实数据库连接】，它只读 schema.prisma 生成类型。
 *
 * 所以：构建期允许为空字符串（generate 正常工作）；
 * 真正执行 migrate / db push 时必须有真实值，缺失会由 Prisma 自己报出清晰错误。
 */
const databaseUrl = process.env.DATABASE_URL ?? '';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});