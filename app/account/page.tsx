'use client';

// ============================================================================
// app/account/page.tsx —— 个人中心（余额 / 充值 / 我的作品 / 消费记录）
// ----------------------------------------------------------------------------
// 产品规则（用户澄清版）：全站开放浏览；本页为登录用户专属（刷脸）。
// 数据源：
//   我的作品 → WordPress coupiya/v1/movies（author_user_id 服务端过滤，见
//              wordpress/functions-additions.php 片段 B）
//   消费记录 → /api/account/transactions（Prisma 流水表，登录可见）
//   余额     → /api/auth/me（useAuth）
// 诚实契约：加载骨架、失败重试、错误码 + requestId，绝不 fake 数据。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRightStartOnRectangleIcon,
  ClockIcon,
  FilmIcon,
  WalletIcon,
} from '@heroicons/react/24/outline';
import FaceAuthModal from '@/components/FaceAuthModal';
import { useAuth } from '@/hooks/useAuth';

/* ============================================================================
 * 一、常量与工具
 * ========================================================================= */

/** WordPress 自定义命名空间端点：从 NEXT_PUBLIC_WP_REST_URL 推导 coupiya/v1 */
const WP_CUSTOM_BASE = (
  process.env.NEXT_PUBLIC_WP_REST_URL || 'https://api.coupiya.com/wordpress/wp-json/wp/v2'
).replace(/\/wp\/v2$/, '') + '/coupiya/v1';

interface MyMovie {
  id: number;
  title: string;
  slug: string;
  link: string;
  date?: string;
  poster?: string;
  genre?: string;
  playUrl?: string;
}

interface Txn {
  id: number;
  type: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

const TXN_LABEL: Record<string, string> = {
  recharge: '充值',
  consume: '消耗',
  refund: '退款',
  rebate: '返还',
};

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function stripHtml(html: string): string {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ============================================================================
 * 二、主组件
 * ========================================================================= */

export default function AccountPage() {
  const { user, loading: authLoading, setUser, logout } = useAuth();
  const [showFaceAuth, setShowFaceAuth] = useState(false);

  // ---- 我的作品 ----
  const [movies, setMovies] = useState<MyMovie[]>([]);
  const [moviesTotal, setMoviesTotal] = useState(0);
  const [moviesLoading, setMoviesLoading] = useState(true);
  const [moviesError, setMoviesError] = useState('');
  const moviesPageRef = useRef(1);
  const moviesAbortRef = useRef<AbortController | null>(null);

  // ---- 消费记录 ----
  const [txns, setTxns] = useState<Txn[]>([]);
  const [txnsLoading, setTxnsLoading] = useState(true);
  const [txnsError, setTxnsError] = useState('');

  /* ---- 加载我的作品（WordPress coupiya/v1/movies，服务端按 author 过滤） ---- */
  const loadMovies = useCallback(
    async (page: number, mode: 'replace' | 'append') => {
      if (!user) return;
      if (mode === 'replace') setMoviesLoading(true);
      setMoviesError('');
      const ctrl = new AbortController();
      moviesAbortRef.current?.abort();
      moviesAbortRef.current = ctrl;
      try {
        const res = await fetch(
          `${WP_CUSTOM_BASE}/movies?author_user_id=${user.id}&per_page=12&page=${page}`,
          { signal: ctrl.signal, cache: 'no-store' },
        );
        const data = (await res.json().catch(() => null)) as
          | { items?: MyMovie[]; total?: number }
          | null;
        if (!res.ok || !data || !Array.isArray(data.items)) {
          throw new Error(`加载失败（HTTP ${res.status}）`);
        }
        setMovies((prev) => (mode === 'replace' ? data.items! : [...prev, ...data.items!]));
        setMoviesTotal(Number(data.total ?? 0));
        moviesPageRef.current = page;
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') setMoviesError((e as Error)?.message ?? '网络异常');
      } finally {
        moviesAbortRef.current = null;
        setMoviesLoading(false);
      }
    },
    [user],
  );

  /* ---- 加载消费记录 ---- */
  const loadTxns = useCallback(async () => {
    setTxnsLoading(true);
    setTxnsError('');
    try {
      const res = await fetch('/api/account/transactions', { cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as { success?: boolean; items?: Txn[] } | null;
      if (!res.ok || !data?.success) throw new Error(`HTTP ${res.status}`);
      setTxns(Array.isArray(data.items) ? data.items : []);
    } catch {
      setTxnsError('消费记录加载失败');
    } finally {
      setTxnsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadMovies(1, 'replace');
      void loadTxns();
    } else {
      setMovies([]);
      setTxns([]);
      setMoviesLoading(false);
      setTxnsLoading(false);
    }
    return () => moviesAbortRef.current?.abort();
  }, [user, loadMovies, loadTxns]);

  /* ---- 退出登录 ---- */
  const handleLogout = useCallback(async () => {
    await logout();
    setShowFaceAuth(false);
  }, [logout]);

  /* ---- 渲染 ---- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-purple-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {authLoading ? (
          <div className="bg-white rounded-2xl shadow-md p-10 text-center text-gray-500">正在校验登录状态…</div>
        ) : !user ? (
          /* 闸门：个人中心需登录（刷脸） */
          <div className="bg-white rounded-2xl shadow-md p-10 text-center">
            <div className="text-5xl mb-4">🪪</div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">登录后查看个人中心</h1>
            <p className="text-sm text-gray-500 mb-6">余额、我的作品与消费记录仅对本人可见。</p>
            <button
              type="button"
              onClick={() => setShowFaceAuth(true)}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              开始刷脸 · 登录 / 注册
            </button>
          </div>
        ) : (
          <>
            {/* 用户信息卡 */}
            <div className="bg-white rounded-2xl shadow-md p-6 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg flex-shrink-0">
                  {(user.nickname || '创').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-bold text-gray-800 truncate">@{user.nickname || `创作者 ${user.id}`}</h1>
                  <p className="text-xs text-gray-400 mt-1">全球创作者 · 作品上墙即全球可见</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="inline-flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-full bg-green-100 text-green-700">
                    <WalletIcon className="w-4 h-4" />
                    {user.balance} Credits
                  </span>
                  <div className="flex gap-2">
                    <Link
                      href="/recharge"
                      className="px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold hover:scale-105 transition-transform"
                    >
                      充值
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors"
                    >
                      <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
                      退出
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 我的作品 */}
            <section className="bg-white rounded-2xl shadow-md p-6 mb-6">
              <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FilmIcon className="w-5 h-5 text-purple-500" />
                我的作品
                <span className="text-xs text-gray-400 font-normal">（共 {moviesTotal} 部）</span>
              </h2>

              {moviesLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="aspect-[2/3] bg-gray-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : moviesError ? (
                <div className="text-center py-8">
                  <p className="text-sm text-red-500 mb-3">⚠️ {moviesError}</p>
                  <button
                    type="button"
                    onClick={() => void loadMovies(1, 'replace')}
                    className="px-6 py-2 rounded-full bg-purple-500 text-white text-sm font-semibold hover:bg-purple-600 transition-colors"
                  >
                    重试
                  </button>
                </div>
              ) : movies.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="mb-3">还没有作品，快去创作第一部 AI 电影吧！</p>
                  <Link href="/blog" className="inline-block px-6 py-2 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold shadow hover:scale-105 transition-transform">
                    🚀 前往极速AI极客创作空间
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {movies.map((m) => (
                      <Link
                        key={m.id}
                        href={m.slug ? `/movie/${encodeURIComponent(m.slug)}` : m.link}
                        {...(m.slug ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                        className="group relative rounded-xl overflow-hidden bg-gray-900 aspect-[2/3] shadow-md hover:shadow-xl transition-all"
                      >
                        {m.poster ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.poster}
                            alt={stripHtml(m.title)}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-4xl opacity-60">🎬</div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                          <p className="text-white text-sm font-semibold truncate">{stripHtml(m.title) || '未命名作品'}</p>
                          <p className="text-gray-300 text-[11px] mt-0.5">
                            {m.genre || 'AI 影视'} · {formatDate(m.date) || ''}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                  {movies.length < moviesTotal && (
                    <button
                      type="button"
                      onClick={() => void loadMovies(moviesPageRef.current + 1, 'append')}
                      className="mt-5 w-full py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors"
                    >
                      加载更多（{movies.length}/{moviesTotal}）
                    </button>
                  )}
                </>
              )}
            </section>

            {/* 消费记录 */}
            <section className="bg-white rounded-2xl shadow-md p-6">
              <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-purple-500" />
                消费记录
              </h2>
              {txnsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : txnsError ? (
                <div className="text-center py-6">
                  <p className="text-sm text-red-500 mb-3">{txnsError}</p>
                  <button
                    type="button"
                    onClick={() => void loadTxns()}
                    className="px-6 py-2 rounded-full bg-purple-500 text-white text-sm font-semibold hover:bg-purple-600 transition-colors"
                  >
                    重试
                  </button>
                </div>
              ) : txns.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-sm">暂无记录，充值后开始创作吧。</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {txns.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800">
                          {TXN_LABEL[t.type] || t.type}
                          <span className="text-gray-400 text-xs ml-2">{formatDate(t.createdAt)}</span>
                        </p>
                        <p className="text-xs text-gray-400 truncate">{t.reason}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className={`font-semibold ${t.amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {t.amount >= 0 ? '+' : ''}{t.amount}
                        </p>
                        <p className="text-xs text-gray-400">余额 {t.balanceAfter}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <FaceAuthModal
        open={showFaceAuth}
        onClose={() => setShowFaceAuth(false)}
        onSuccess={(u) => {
          setUser(u);
          setShowFaceAuth(false);
        }}
      />
    </div>
  );
}
