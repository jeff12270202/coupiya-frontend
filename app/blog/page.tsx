'use client';

// ============================================================================
// app/blog/page.tsx —— 全球生产级灵感日志首页（blog 主站）
// ----------------------------------------------------------------------------
// 相对原版的全部升级：
//   1. 【删除 Cloud Studio 共享死链接】紫色按钮改为：刷脸登录 → 余额校验 →
//      POST /api/create-ugc-studio 动态创建个人专属空间（不再是"样板房"）
//   2. 【Pexels Key 移出客户端】改调服务端代理 /api/pexels/videos（Key 只存服务端）
//   3. 【修复电影墙】删除假评分/假时长/假简介；真实作者（作者：@xxx）+ 日期 + 分类；
//      错误重试 + 骨架屏 + 无限滚动（IntersectionObserver）+ AbortController
//   4. 【修复 XSS】灵感日志摘要不再 dangerouslySetInnerHTML，改为去标签纯文本
//   5. 【修复死按钮】"立即观看"改为真实 Link；SafeImage 失败态随 src 重置
//   6. 全站浏览开放，仅「AI 视频生成」与「极客创作空间」两个入口强制刷脸+余额
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import NextDynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import {
  SparklesIcon,
  LanguageIcon,
  FilmIcon,
  PlayCircleIcon,
  XMarkIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { useAuth, type AuthUser } from '@/hooks/useAuth';
import FaceAuthModal from '@/components/FaceAuthModal';
import FloatingChat from '@/components/FloatingChat';
import ClientOnly from '@/components/ClientOnly';
import { useAuthorNames } from '@/lib/use-author-names';

/* ---------------------------------------------------------------------------
 * 常量与工具
 * ------------------------------------------------------------------------- */

// 【CORS 修复】浏览器端走同源代理 /api/wp（next.config.js rewrites →
// https://blog.coupiya.com/wp-json/wp/v2）。blog.coupiya.com 对
// Origin: http://localhost:3000 不返回 Access-Control-Allow-Origin，
// 浏览器直连会报 "Failed to fetch"；服务端仍用绝对地址。
const WP_API_BASE =
  typeof window !== 'undefined'
    ? '/api/wp'
    : (process.env.NEXT_PUBLIC_WP_API_URL ?? 'https://blog.coupiya.com/wp-json/wp/v2').replace(/\/+$/, '');

const PLACEHOLDER_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%231a1a2e'/%3E%3Cstop offset='100%25' style='stop-color:%2316213e'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='600' fill='url(%23bg)'/%3E%3Ctext x='200' y='280' text-anchor='middle' fill='%23e94560' font-family='Arial' font-size='64' font-weight='bold'%3E🎬%3C/text%3E%3Ctext x='200' y='340' text-anchor='middle' fill='%238a8a9a' font-family='Arial' font-size='20'%3ECOUPIYA%3C/text%3E%3Ctext x='200' y='370' text-anchor='middle' fill='%235a5a6a' font-family='Arial' font-size='14'%3EAI MOVIE%3C/text%3E%3C/svg%3E";

/** 去除 HTML 标签并解码实体（SSR 安全） */
function stripHtml(html: string): string {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dedupeById<T extends { id: number }>(list: T[]): T[] {
  const seen = new Set<number>();
  return list.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}

function resolveSlug(movie: MovieData): string {
  const raw =
    movie.slug ||
    (() => {
      try {
        const u = new URL(movie.link);
        const segs = u.pathname.replace(/\/+$/, '').split('/');
        return segs[segs.length - 1] || '';
      } catch {
        return '';
      }
    })();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/* ---------------------------------------------------------------------------
 * 类型
 * ------------------------------------------------------------------------- */

interface WpMedia {
  source_url?: string;
}
interface WpTerm {
  id: number;
  name: string;
}

interface MovieData {
  id: number;
  slug: string;
  title: { rendered: string };
  link: string;
  date?: string;
  author_user_id?: number | string | null;
  author_name?: string | null;
  movie_genre?: WpTerm[];
  _embedded?: { 'wp:featuredmedia'?: WpMedia[] };
}

interface PostData {
  id: number;
  slug: string;
  title: { rendered: string };
  date: string;
  excerpt: { rendered: string };
  _embedded?: { 'wp:featuredmedia'?: WpMedia[] };
}

interface PexelsVideo {
  id: number;
  poster: string;
  files: Array<{ link: string; quality: string; width: number; height: number }>;
}

/* ---------------------------------------------------------------------------
 * 子组件
 * ------------------------------------------------------------------------- */

/** 图片：失败兜底 + 失败态随 src 重置 + 懒加载 */
function SafeImage({ src, alt, fill, className }: { src: string; alt: string; fill?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const effectiveSrc = src && src !== PLACEHOLDER_POSTER ? src : '';
  useEffect(() => setFailed(false), [effectiveSrc]);

  if (failed || !effectiveSrc) {
    return (
      <div className={className} style={{ background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 48, opacity: 0.6 }}>🎬</span>
      </div>
    );
  }
  if (fill) {
    return <Image src={effectiveSrc} alt={alt} fill className={className} unoptimized onError={() => setFailed(true)} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={effectiveSrc}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-md animate-pulse">
      <div className="aspect-[2/3] bg-gray-200" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-gray-200 rounded w-3/4" />
        <div className="h-2 bg-gray-200 rounded w-1/2" />
      </div>
    </div>
  );
}

function MovieCard({ movie, authorName }: { movie: MovieData; authorName?: string }) {
  const title = stripHtml(movie.title.rendered) || '未命名作品';
  const author = authorName || movie.author_name || (movie.author_user_id ? `创作者 ${movie.author_user_id}` : '匿名创作者');
  const genre = movie.movie_genre?.[0]?.name;
  const dateText = formatDate(movie.date);
  const slug = resolveSlug(movie);
  const href = slug ? `/movie/${encodeURIComponent(slug)}` : movie.link;
  const isExternal = !slug;
  const posterSrc = movie._embedded?.['wp:featuredmedia']?.[0]?.source_url || PLACEHOLDER_POSTER;

  return (
    <Link
      href={href}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="group relative bg-white rounded-xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-gray-200">
        <SafeImage src={posterSrc} alt={title} fill className="object-cover transition-transform duration-500 group-hover:scale-105 group-hover:brightness-75" />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-black shadow-lg">▶</div>
        </div>
      </div>
      <div className="p-3">
        <h4 className="font-bold text-gray-800 text-sm truncate" title={title}>{title}</h4>
        <p className="text-[11px] text-purple-500 mt-1 truncate" title={author}>作者：@{author}</p>
        <div className="flex justify-between items-center mt-2 text-[10px] text-gray-400">
          <span>{genre || 'AI 影视'}</span>
          <span>{dateText || ''}</span>
        </div>
      </div>
    </Link>
  );
}

function PostCard({ post }: { post: PostData }) {
  const title = stripHtml(post.title.rendered) || '未命名';
  const excerpt = stripHtml(post.excerpt.rendered).slice(0, 160);
  const dateText = formatDate(post.date);
  return (
    <Link href={`/blog/${post.slug}`} className="block group">
      <div className="flex flex-col md:flex-row gap-4 py-6 border-b border-gray-100 hover:bg-gray-50 transition-colors p-4 rounded-xl">
        {post._embedded?.['wp:featuredmedia']?.[0]?.source_url && (
          <div className="relative w-full md:w-48 h-32 flex-shrink-0 rounded-lg overflow-hidden">
            <SafeImage src={post._embedded['wp:featuredmedia'][0].source_url} alt={title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
          </div>
        )}
        <div className="flex-1 flex flex-col justify-center">
          <h3 className="text-xl font-semibold text-gray-800 group-hover:text-purple-600 transition-colors">{title}</h3>
          <p className="text-sm text-gray-500 line-clamp-2 mt-1">{excerpt}</p>
          <div className="text-xs text-gray-400 mt-2">{dateText}</div>
        </div>
      </div>
    </Link>
  );
}

/** 充值引导弹窗 */
function RechargeGate({ open, onClose, balance }: { open: boolean; onClose: () => void; balance: number }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-5xl mb-4">💰</div>
        <h3 className="text-xl font-bold text-gray-800 mb-2">充值后开启创作</h3>
        <p className="text-sm text-gray-500 mb-6">当前余额：<span className="font-bold text-purple-600">{balance}</span> Credits</p>
        <div className="flex gap-3">
          <Link href="/recharge" className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg hover:scale-[1.02] transition-all">立即充值（PayPal / 万里汇）</Link>
          <button type="button" onClick={onClose} className="px-5 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200 transition-colors">稍后</button>
        </div>
      </div>
    </div>
  );
}

/** 短视频流（数据走服务端代理，Key 不暴露） */
function VideoFeedModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [videos, setVideos] = useState<PexelsVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    const ctrl = new AbortController();
    fetch('/api/pexels/videos?per_page=15', { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && Array.isArray(d.videos) && d.videos.length > 0) setVideos(d.videos);
        else setError('视频流暂不可用');
      })
      .catch(() => setError('视频流加载失败'))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [isOpen]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
      <button onClick={onClose} aria-label="关闭" className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
        <XMarkIcon className="w-8 h-8" />
      </button>
      <div className="w-full h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide bg-black">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-white text-xl">🌍 加载视频流中...</div>
        ) : error || videos.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-white text-xl">{error || '暂无视频'}</div>
        ) : (
          videos.map((v, i) => {
            const hd = v.files.find((f) => f.quality === 'hd');
            const u = hd?.link || v.files[0]?.link;
            return (
              <div key={v.id || i} className="w-full h-[100vh] snap-start relative flex items-center justify-center bg-gray-900">
                <video src={u} poster={v.poster || undefined} className="w-full h-full object-cover" controls loop autoPlay muted={i !== 0} playsInline />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function FloatingVideoButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="fixed bottom-24 right-6 z-40 p-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center gap-2">
      <PlayCircleIcon className="w-8 h-8" />
      <span className="text-xs font-bold pr-1 hidden sm:block">刷短视频</span>
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * 服务卡片
 * ------------------------------------------------------------------------- */

const SERVICES = [
  { id: 'image', title: 'AI 纹样创生', description: '输入灵感，生成独一无二的陶瓷花纹/饰品设计图。', icon: SparklesIcon, color: 'from-purple-400 to-pink-400', gate: false },
  { id: 'translate', title: '全球雅集翻译', description: '打破语言界限，与全球陶瓷爱好者交流。', icon: LanguageIcon, color: 'from-green-400 to-emerald-500', gate: false },
  { id: 'video', title: 'AI 视频生成', description: '用AI将你的创意转化为精美短视频，展示陶瓷之美。', icon: FilmIcon, color: 'from-blue-400 to-cyan-500', gate: true },
] as const;

type ServiceId = (typeof SERVICES)[number]['id'];

const AIImageModal = NextDynamic(() => import('@/components/AIImageModal'), { ssr: false });
const VideoModal = NextDynamic(() => import('@/components/VideoModal'), { ssr: false });
const TranslateModal = NextDynamic(() => import('@/components/TranslateModal'), { ssr: false });

/* ---------------------------------------------------------------------------
 * 主页面
 * ------------------------------------------------------------------------- */

export default function BlogPage() {
  const { user, loading: authLoading, refresh, setUser } = useAuth();
  const userRef = useRef<AuthUser | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const [activeModal, setActiveModal] = useState<ServiceId | null>(null);
  const [showFace, setShowFace] = useState(false);
  const [showRecharge, setShowRecharge] = useState(false);
  const pendingActionRef = useRef<'video' | 'studio' | null>(null);

  const [studioState, setStudioState] = useState<'idle' | 'creating' | 'error'>('idle');
  const [studioError, setStudioError] = useState('');
  const [isVideoFeedOpen, setIsVideoFeedOpen] = useState(false);

  // ---- 电影墙 ----
  const [movies, setMovies] = useState<MovieData[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ---- 灵感日志 ----
  const [posts, setPosts] = useState<PostData[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const fetchMovies = useCallback(async (pageNum: number, mode: 'replace' | 'append') => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (mode === 'replace') setInitialLoading(true);
    else setLoadingMore(true);
    setLoadError(null);
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    try {
      const res = await fetch(`${WP_API_BASE}/movie?page=${pageNum}&per_page=12&_embed`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`加载失败（HTTP ${res.status}）`);
      const data: MovieData[] = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setHasMore(false);
      } else {
        setMovies((prev) => dedupeById(mode === 'replace' ? data : [...prev, ...data]));
        pageRef.current = pageNum;
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setLoadError((e as Error)?.message ?? '网络异常');
    } finally {
      inFlightRef.current = false;
      setInitialLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const fetchPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const res = await fetch(`${WP_API_BASE}/posts?per_page=5&_embed`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed');
      const data = (await res.json()) as PostData[];
      setPosts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('📝 拉取日志失败:', e);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    void fetchMovies(1, 'replace');
    void fetchPosts();
    return () => abortRef.current?.abort();
  }, [fetchMovies, fetchPosts]);

  // 无限滚动
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !inFlightRef.current && !initialLoading) void fetchMovies(pageRef.current + 1, 'append');
      },
      { rootMargin: '600px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, initialLoading, fetchMovies]);

  /* ---------- 创作入口守卫（刷脸 → 余额 → 执行） ---------- */
  const requestCreate = useCallback(
    (kind: 'video' | 'studio') => {
      if (authLoading) return;
      const current = userRef.current;
      if (!current) {
        pendingActionRef.current = kind;
        setShowFace(true);
        return;
      }
      if (current.balance <= 0) {
        pendingActionRef.current = kind;
        setShowRecharge(true);
        return;
      }
      pendingActionRef.current = null;
      if (kind === 'video') setActiveModal('video');
    },
    [authLoading],
  );

  const openService = useCallback(
    (id: ServiceId) => {
      const svc = SERVICES.find((s) => s.id === id);
      if (svc?.gate) {
        requestCreate('video');
        return;
      }
      setActiveModal(id);
    },
    [requestCreate],
  );

  /* ---------- 极客创作空间：动态创建（替换共享死链接） ---------- */
  const openStudio = useCallback(async () => {
    const current = userRef.current;
    if (authLoading) return;
    if (!current) {
      pendingActionRef.current = 'studio';
      setShowFace(true);
      return;
    }
    if (current.balance <= 0) {
      pendingActionRef.current = 'studio';
      setShowRecharge(true);
      return;
    }
    setStudioState('creating');
    setStudioError('');
    try {
      const res = await fetch('/api/create-ugc-studio', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `创建失败（HTTP ${res.status}）`);
      if (!data?.url) throw new Error('后端未返回工作空间链接');
      window.open(data.url, '_blank', 'noopener,noreferrer');
      setStudioState('idle');
    } catch (e) {
      setStudioState('error');
      setStudioError(e instanceof Error ? e.message : '创建空间失败，请稍后重试');
    }
  }, [authLoading]);

  const onFaceSuccess = useCallback(
    (freshUser: AuthUser) => {
      setUser(freshUser);
      setShowFace(false);
      const kind = pendingActionRef.current;
      pendingActionRef.current = null;
      if (!freshUser || freshUser.balance <= 0) {
        if (kind) setShowRecharge(true);
        return;
      }
      if (kind === 'studio') void openStudio();
      else if (kind === 'video') setActiveModal('video');
    },
    [setUser, openStudio],
  );

  const featured = movies[0];

  /* ---- 作者真名化：批量解析电影墙上的 author_user_id（荣誉标签） ---- */
  const authorIds = movies.map((m) => m.author_user_id).filter((v) => v !== null && v !== undefined);
  const authorNames = useAuthorNames(authorIds as Array<number | string>);
  const authorNameOf = (m: MovieData): string | undefined =>
    m.author_user_id != null ? authorNames[String(m.author_user_id)] : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-amber-50 pb-20">
      {/* 顶部用户条 */}
      <header className="relative z-20">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-end gap-3">
          {user ? (
            <>
              <Link href="/account" className="flex items-center gap-2 text-sm text-gray-600 hover:text-purple-600 transition-colors">
                <UserCircleIcon className="w-5 h-5" />
                {user.nickname || `用户${user.id}`}
              </Link>
              <span className="text-sm text-purple-600 font-semibold">余额 {user.balance}</span>
              <Link href="/recharge" className="px-4 py-1.5 rounded-full bg-purple-500 text-white text-sm font-semibold hover:bg-purple-600 transition-colors">充值</Link>
            </>
          ) : (
            <span className="text-xs text-gray-400">欢迎全球创作者 · 网站全站免费开放浏览</span>
          )}
        </div>
      </header>

      {/* Hero + Cloud Studio（动态分配入口） */}
      <section className="relative py-24 overflow-hidden text-center">
        <div className="container mx-auto px-4 relative z-10">
          <div className="inline-block mb-4 px-4 py-1 bg-white/50 rounded-full backdrop-blur-sm text-purple-600 text-sm font-semibold">🌍 全球顶级创作生态</div>
          <h1 className="text-5xl font-serif font-bold text-gray-800 mb-4 tracking-wide">全球AI 流媒影视共享</h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">上传你的灵感、创作你的影视。极客空间提供 5GB 专属云盘，创作即全球发布。</p>

          <div className="flex flex-col items-center mt-6 mb-10">
            <button
              type="button"
              onClick={() => void openStudio()}
              disabled={authLoading || studioState === 'creating'}
              className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xl rounded-full shadow-2xl hover:scale-105 transition-transform flex items-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {studioState === 'creating' ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  正在创建您的专属空间…
                </span>
              ) : (
                <><span className="text-2xl">🚀</span> 极速 AI 极客创作空间 (Cloud Studio)</>
              )}
            </button>
            <p className="text-gray-500 text-sm mt-3 text-center">专属 5GB 云盘 · 一人一空间 · 创作即全球发布</p>
            {studioState === 'error' && <p className="mt-2 text-red-500 text-sm">⚠️ {studioError}</p>}
          </div>
        </div>
      </section>

      {/* AI 服务卡片 */}
      <section className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {SERVICES.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.id} className="group bg-white rounded-2xl shadow-lg cursor-pointer hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border-2 border-gray-100 hover:border-purple-200" onClick={() => openService(s.id)}>
                <div className="p-10 text-center">
                  <div className={`w-20 h-20 mx-auto rounded-2xl bg-gradient-to-r ${s.color} flex items-center justify-center mb-6 shadow-xl`}>
                    <Icon className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-gray-800">{s.title}</h3>
                  <p className="text-gray-600 mb-8 leading-relaxed">{s.description}</p>
                  {s.gate && <p className="text-xs text-amber-500 mb-3">创作入口 · 需刷脸登录并充值</p>}
                  <div className="inline-flex items-center gap-2 text-purple-600 font-semibold group-hover:gap-3 transition-all"><span>立即体验</span><span>→</span></div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 影视流媒区 */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-serif font-bold text-gray-800 mb-4 tracking-wider flex items-center justify-center gap-2">
            <span className="w-4 h-4 rounded-full bg-teal-500 inline-block"></span> WE ARE THE WORLD AI 影视
          </h2>
          <p className="text-gray-500 text-sm tracking-wide">海量 AI 影视持续创作，为全球每个角落的你，呈现视听震撼</p>
        </div>

        {initialLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 max-w-6xl mx-auto">
            {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : loadError && movies.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-xl mb-6">🌍 {loadError}</p>
            <button type="button" onClick={() => void fetchMovies(1, 'replace')} className="px-8 py-3 rounded-full bg-purple-500 text-white font-semibold hover:bg-purple-600 transition-colors">重新加载</button>
          </div>
        ) : movies.length === 0 ? (
          <div className="text-center py-20 text-gray-400">暂无 AI 影视作品，请等候后台自动生成。</div>
        ) : (
          <>
            {featured && (
              <div className="max-w-6xl mx-auto mb-16 relative group rounded-2xl overflow-hidden shadow-2xl bg-gray-900">
                <SafeImage
                  src={featured._embedded?.['wp:featuredmedia']?.[0]?.source_url || PLACEHOLDER_POSTER}
                  alt={stripHtml(featured.title.rendered)}
                  className="w-full h-[400px] md:h-[500px] object-cover opacity-80 group-hover:opacity-70 transition-opacity"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                <div className="absolute bottom-10 left-10 right-10 text-white z-10">
                  <span className="bg-purple-600 text-xs px-2 py-1 rounded-md mb-2 inline-block">🔥 最新 AI 热映</span>
                  <h2 className="text-3xl md:text-4xl font-bold">{stripHtml(featured.title.rendered)}</h2>
                  <p className="text-gray-300 mt-2 text-sm">
                    作者：@
                    {authorNameOf(featured) ||
                      featured.author_name ||
                      (featured.author_user_id ? `创作者 ${featured.author_user_id}` : '匿名创作者')}
                    {featured.movie_genre?.[0]?.name ? ` · ${featured.movie_genre[0].name}` : ''}
                    {formatDate(featured.date) ? ` · ${formatDate(featured.date)}` : ''}
                  </p>
                  {(() => {
                    const slug = resolveSlug(featured);
                    const href = slug ? `/movie/${encodeURIComponent(slug)}` : featured.link;
                    return (
                      <Link href={href} {...(slug ? {} : { target: '_blank', rel: 'noopener noreferrer' })} className="mt-4 inline-block bg-white text-black px-6 py-2 rounded-full font-semibold hover:bg-gray-200 transition">
                        立即观看 →
                      </Link>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="max-w-6xl mx-auto">
              <h3 className="text-2xl font-bold mb-6 border-l-4 border-purple-500 pl-3">🎬 最新上架 AI 短剧</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {movies.map((m) => <MovieCard key={m.id} movie={m} authorName={authorNameOf(m)} />)}
              </div>
            </div>

            <div ref={sentinelRef} className="flex justify-center mt-16">
              {loadError && movies.length > 0 && <p className="text-sm text-red-400 mb-3">{loadError}</p>}
              {loadingMore ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <span className="w-5 h-5 border-2 border-purple-300 border-t-purple-500 rounded-full animate-spin" />
                  正在加载更多 AI 宇宙…
                </div>
              ) : hasMore ? (
                <button type="button" onClick={() => void fetchMovies(pageRef.current + 1, 'append')} className="px-10 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all">
                  ↓ 向下无限浏览 ↓
                </button>
              ) : (
                <p className="text-gray-400 text-sm">✨ 已经抵达 AI 影视的宇宙边缘，敬请等待新作诞生 ✨</p>
              )}
            </div>
          </>
        )}
      </section>

      {/* 灵感日志（已修复 XSS：摘要去标签纯文本） */}
      <section className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex justify-between items-end mb-8 border-b-2 border-purple-200 pb-4">
          <h2 className="text-3xl font-serif font-bold text-gray-800 flex items-center gap-2"><span className="text-3xl">📝</span> 灵感日志</h2>
          <Link href="/blog" className="text-purple-600 text-sm hover:underline">查看全部 →</Link>
        </div>
        {loadingPosts ? (
          <div className="text-center py-10 text-gray-400">加载灵感日志中...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-10 text-gray-400">还没有灵感日志，快去 AI 卡片生成吧！</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100">
            {posts.map((p) => <PostCard key={p.id} post={p} />)}
          </div>
        )}
      </section>

      {/* 弹窗（AI 视频生成已加创作门槛；纹样/翻译免费开放） */}
      {activeModal === 'image' && <AIImageModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'translate' && <TranslateModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'video' && <VideoModal onClose={() => setActiveModal(null)} />}

      <FaceAuthModal open={showFace} onClose={() => setShowFace(false)} onSuccess={onFaceSuccess} />
      <RechargeGate open={showRecharge} onClose={() => setShowRecharge(false)} balance={user?.balance ?? 0} />

      <ClientOnly>
        <FloatingChat />
        <FloatingVideoButton onClick={() => setIsVideoFeedOpen(true)} />
        <VideoFeedModal isOpen={isVideoFeedOpen} onClose={() => setIsVideoFeedOpen(false)} />
      </ClientOnly>
    </div>
  );
}
