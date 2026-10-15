'use client';

// ============================================================================
// components/SiteNav.tsx —— 全局顶部导航（客户端组件：激活态高亮）
// ----------------------------------------------------------------------------
// 相对原版 layout 内联导航的全部升级：
//   1. 【修复残缺类】原版 AI-WORDPRESS 链接有个断裂的 transition- 类（无值），已删除
//   2. 基于 usePathname 的激活态高亮（当前路由高亮，不再全静态）
//   3. aria-label 无障碍标注；每个链接带稳定 key
// ============================================================================

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV_ITEMS = [
  { href: '/ai-wordpress', label: 'AI-WORDPRESS创作工坊' },
  { href: '/satellite', label: '星链接入口' },
  { href: '/blog', label: '灵感日志' },
];

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="主导航" className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50 border-b border-pink-100">
      <div className="container mx-auto px-4 py-3 flex space-x-6 items-center flex-wrap gap-y-2">
        {/* 品牌 */}
        <Link
          href="/"
          className="px-6 py-3 text-rose-500 hover:text-rose-600 font-serif text-xl font-bold tracking-wide border-2 border-rose-300 rounded-xl bg-gradient-to-br from-rose-50 to-white shadow-[4px_4px_8px_rgba(0,0,0,0.1),-2px_-2px_6px_rgba(255,255,255,0.8)] hover:shadow-[6px_6px_12px_rgba(0,0,0,0.15),-3px_-3px_8px_rgba(255,255,255,0.9)] hover:-translate-y-0.5 transition-all"
        >
          瓷间 · 灵韵集
        </Link>

        {/* 导航项（激活态高亮） */}
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`px-6 py-3 font-medium rounded-xl border-2 bg-gradient-to-br to-white shadow-[4px_4px_8px_rgba(0,0,0,0.1),-2px_-2px_6px_rgba(255,255,255,0.8)] hover:shadow-[6px_6px_12px_rgba(0,0,0,0.15),-3px_-3px_8px_rgba(255,255,255,0.9)] hover:-translate-y-0.5 transition-all ${
                active
                  ? 'text-purple-600 border-purple-400 from-purple-50'
                  : 'text-gray-600 hover:text-rose-500 border-amber-300 from-amber-50'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
