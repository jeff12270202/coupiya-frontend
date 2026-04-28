import { Providers } from './providers';
import Link from 'next/link';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-ceramic">
        <Providers>
          <nav className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50 border-b border-pink-100">
            <div className="container mx-auto px-4 py-3 flex space-x-8 items-center">
              <Link href="/" className="text-rose-500 hover:text-rose-600 font-serif text-xl font-bold tracking-wide">瓷间 · 灵韵集</Link>
              <Link href="/lower-screen" className="text-gray-600 hover:text-rose-500 font-medium transition">AI 创作工坊</Link>
              <Link href="/blog" className="text-gray-600 hover:text-rose-500 font-medium transition">灵感日志</Link>
            </div>
          </nav>
          <main className="container mx-auto px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}