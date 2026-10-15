import { defineConfig, env } from 'prisma/config';
import { config } from 'dotenv';
import path from 'path';

// 确保 Prisma CLI 能加载 .env 中的变量
config({ path: path.resolve(process.cwd(), '.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});