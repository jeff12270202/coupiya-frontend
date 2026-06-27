import { Providers } from './providers';
import Link from 'next/link';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-gradient-to-br from-rose-50 via-white to-amber-50 min-h-screen">
        <Providers>
          <nav className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50 border-b border-pink-100">
            <div className="container mx-auto px-4 py-3 flex space-x-6 items-center">
              <Link href="/" className="px-6 py-3 text-rose-500 hover:text-rose-600 font-serif text-xl font-bold tracking-wide border-2 border-rose-300 rounded-xl bg-gradient-to-br from-rose-50 to-white shadow-[4px_4px_8px_rgba(0,0,0,0.1),-2px_-2px_6px_rgba(255,255,255,0.8)] hover:shadow-[6px_6px_12px_rgba(0,0,0,0.15),-3px_-3px_8px_rgba(255,255,255,0.9)] hover:-translate-y-0.5 transition-all">瓷间 · 灵韵集</Link>
              <Link href="/ai-wordpress" className="px-6 py-3 text-rose-500 hover:text-rose-600 font-medium transition border-2 border-purple-300 rounded-xl bg-gradient-to-br from-purple-50 to-white shadow-[4px_4px_8px_rgba(0,0,0,0.1),-2px_-2px_6px_rgba(255,255,255,0.8)] hover:shadow-[6px_6px_12px_rgba(0,0,0,0.15),-3px_-3px_8px_rgba(255,255,255,0.9)] hover:-translate-y-0.5 transition-all">AI-WORDPRESS创作工坊</Link>
              <Link href="/blog" className="px-6 py-3 text-gray-600 hover:text-rose-500 font-medium transition border-2 border-amber-300 rounded-xl bg-gradient-to-br from-amber-50 to-white shadow-[4px_4px_8px_rgba(0,0,0,0.1),-2px_-2px_6px_rgba(255,255,255,0.8)] hover:shadow-[6px_6px_12px_rgba(0,0,0,0.15),-3px_-3px_8px_rgba(255,255,255,0.9)] hover:-translate-y-0.5 transition-all">灵感日志</Link>
            </div>
          </nav>
          <main className="container mx-auto px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}