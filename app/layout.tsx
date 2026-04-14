import { Providers } from './providers';
import Link from 'next/link';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-gray-50">
        <Providers>
          <nav className="bg-white shadow-md sticky top-0 z-50">
            <div className="container mx-auto px-4 py-3 flex space-x-6">
              <Link href="/" className="text-gray-700 hover:text-blue-600 font-medium">上屏 · 未来商城</Link>
              <Link href="/lower-screen" className="text-gray-700 hover:text-purple-600 font-medium">下屏 · AI 创作中心</Link>
              <Link href="/blog" className="text-gray-700 hover:text-green-600 font-medium">博客 · 灵感库</Link>
            </div>
          </nav>
          <main className="container mx-auto px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}