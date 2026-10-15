// ============================================================================
// app/layout.tsx —— 全球生产级根布局
// ----------------------------------------------------------------------------
// 相对原版的全部升级：
//   1. 【补全 SEO】export const metadata：title/description/keywords/OG/robots；
//      export const viewport（替代旧式 viewport meta）
//   2. 【修复 body 背景冲突】globals.css 已删除样板 body 渐变，body 背景完全
//      由 Tailwind 类控制（原版两者打架，Tailwind 类永远不生效）
//   3. 【导航抽成客户端组件】SiteNav（usePathname 激活态高亮，修复断裂 transition- 类）
//   4. 无障碍 html lang + 语义化 main
// ============================================================================

import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import SiteNav from '@/components/SiteNav';
import './globals.css';

const SITE_NAME = '瓷间 · 灵韵集';
const SITE_URL = 'https://coupiya.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} · 全球 AI 影视创作与陶瓷艺术`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    '极速AI极客创作空间 · 全球 UGC AI 影视平台：一键生成并发布 AI 电影、Cloud Studio 云端极客创作、5GB 专属云盘、陶瓷艺术与全球雅集。',
  keywords: ['AI 视频', 'AI 电影', 'Cloud Studio', 'UGC', '陶瓷艺术', '全球雅集', 'Coupiya'],
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    url: SITE_URL,
    title: `${SITE_NAME} · 全球 AI 影视创作`,
    description: '云端无门槛的 AI 影视生产车间 · 创作即全球发布',
    locale: 'zh_CN',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#fdf2f8',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-gradient-to-br from-rose-50 via-white to-amber-50 min-h-screen">
        <Providers>
          <SiteNav />
          <main className="container mx-auto px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
