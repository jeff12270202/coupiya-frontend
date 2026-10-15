'use client';

/**
 * ============================================================================
 * app/ai-wordpress/page.tsx —— AI-WORDPRESS 创作工坊（全球生产级重写版）
 * ----------------------------------------------------------------------------
 * 设计原则（按用户澄清后的全球产品定位）：
 *   1. 全站浏览完全开放、免费：电影墙 / 作品详情 / AI 纹样创生 / 全球雅集翻译
 *      游客可直接使用，不做任何登录或充值拦截；
 *   2. 仅两个【创作入口】强制门槛（刷脸注册 + 余额 > 0）：
 *        a. 「AI 视频生成」（一键生成并发布）
 *        b. 「极速AI极客创作空间（Cloud Studio）」（动态分配独立 5GB 工作区）
 *   3. 注册方式只允许刷脸（腾讯云基础人脸核身），用户不需要腾讯云账号；
 *   4. 电影墙展示真实作者（作者：@xxx），无假评分假时长假简介。
 * ----------------------------------------------------------------------------
 * 依赖的配套文件（本仓库新增）：
 *   hooks/useAuth.ts                —— 登录态 Hook（GET /api/auth/me）
 *   components/FaceAuthModal.tsx    —— 刷脸注册/登录弹窗
 * 依赖的后端路由（需实现）：
 *   POST /api/create-ugc-studio     —— 动态创建用户专属 Cloud Studio 空间
 *   GET  /api/auth/me               —— 登录态与余额
 *   现有：/api/ai/generate-video、/api/ai/publish-vod-movie（发布闸门）
 * WordPress 侧：需为 movie 注册 REST 字段 author_user_id / author_name
 *   （见文件末尾的 functions.php 代码片段）
 * ============================================================================
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import NextDynamic from 'next/dynamic';
import Link from 'next/link';
import {
  SparklesIcon,
  LanguageIcon,
  FilmIcon,
  RocketLaunchIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { useAuth, type AuthUser } from '@/hooks/useAuth';
import FaceAuthModal from '@/components/FaceAuthModal';
import FloatingChat from '@/components/FloatingChat';
import ClientOnly from '@/components/ClientOnly';
import type { StudioTool } from '@/components/DnaStudio';

/* ---------------------------------------------------------------------------
 * 常量与工具
 * ------------------------------------------------------------------------- */

/** WordPress REST API 根地址：浏览器端走同源代理 /api/wp（next.config.js
 *  rewrites → https://blog.coupiya.com/wp-json/wp/v2），避免 localhost:3000
 *  跨域被拦；服务端渲染仍使用环境变量中的绝对地址。 */
const WP_API_BASE =
  typeof window !== 'undefined'
    ? '/api/wp'
    : (process.env.NEXT_PUBLIC_WP_API_URL ?? 'https://blog.coupiya.com/wp-json/wp/v2').replace(/\/+$/, '');

/** 海报兜底（SVG data URI，减小首屏体积） */
const PLACEHOLDER_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%231a1a2e'/%3E%3Cstop offset='100%25' style='stop-color:%2316213e'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='600' fill='url(%23bg)'/%3E%3Ctext x='200' y='280' text-anchor='middle' fill='%23e94560' font-family='Arial' font-size='64' font-weight='bold'%3E🎬%3C/text%3E%3Ctext x='200' y='340' text-anchor='middle' fill='%238a8a9a' font-family='Arial' font-size='20'%3ECOUPIYA%3C/text%3E%3Ctext x='200' y='370' text-anchor='middle' fill='%235a5a6a' font-family='Arial' font-size='14'%3EAI MOVIE%3C/text%3E%3C/svg%3E";

/** 去除 HTML 标签并解码常见实体（SSR 安全，不依赖 DOM） */
function stripHtml(html: string): string {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** 格式化日期：2026-08-23 */
function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 去重（无限滚动防重复） */
function dedupeById<T extends { id: number }>(list: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const item of list) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** 从 slug 或 WP 链接中解析出站内电影路由 */
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
  /** 下方两个字段需在 WordPress 注册 REST 字段（见文件末尾） */
  author_user_id?: number | string | null;
  author_name?: string | null;
  movie_genre?: WpTerm[];
  _embedded?: { 'wp:featuredmedia'?: WpMedia[] };
}

/* ---------------------------------------------------------------------------
 * 子组件
 * ------------------------------------------------------------------------- */

/** 图片：加载失败兜底、失败态随 src 重置、懒加载 */
function SafeImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const effectiveSrc = src && src !== PLACEHOLDER_POSTER ? src : '';

  useEffect(() => {
    setFailed(false);
  }, [effectiveSrc]);

  if (failed || !effectiveSrc) {
    return (
      <div
        className={className}
        style={{
          background: '#1a1a2e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 48, opacity: 0.6 }}>🎬</span>
      </div>
    );
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

/** 加载骨架卡 */
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

/** 电影卡片：真实标题 + 作者 + 日期 + 类型 */
function MovieCard({ movie }: { movie: MovieData }) {
  const title = stripHtml(movie.title.rendered) || '未命名作品';
  const author =
    movie.author_name || (movie.author_user_id ? `创作者 ${movie.author_user_id}` : '匿名创作者');
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
        <SafeImage
          src={posterSrc}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 group-hover:brightness-75"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-black shadow-lg group-hover:bg-purple-500 group-hover:text-white transition-colors">
            ▶
          </div>
        </div>
      </div>
      <div className="p-3">
        <h4 className="font-bold text-gray-800 text-sm truncate" title={title}>
          {title}
        </h4>
        {/* 作者荣誉标签：作品上墙后用户的名字立刻出现在全球墙前 */}
        <p className="text-[11px] text-purple-500 mt-1 truncate" title={author}>
          作者：@{author}
        </p>
        <div className="flex justify-between items-center mt-2 text-[10px] text-gray-400">
          <span>{genre || 'AI 影视'}</span>
          <span>{dateText || ''}</span>
        </div>
      </div>
    </Link>
  );
}

/** 充值引导弹窗（仅两个创作入口触发） */
function RechargeGate({ open, onClose, balance }: { open: boolean; onClose: () => void; balance: number }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="充值引导"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl mb-4">💰</div>
        <h3 className="text-xl font-bold text-gray-800 mb-2">充值后开启创作</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-1">
          AI 视频生成与极客创作空间需要余额才能使用。
        </p>
        <p className="text-sm text-gray-500 mb-6">
          当前余额：<span className="font-bold text-purple-600">{balance}</span> Credits
        </p>
        <div className="flex gap-3">
          <Link
            href="/recharge"
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
          >
            立即充值（PayPal / 万里汇）
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200 transition-colors"
          >
            稍后
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * 服务卡片配置（AI 纹样 / 翻译完全开放；AI 视频生成走创作门槛）
 * ------------------------------------------------------------------------- */
const SERVICES = [
  {
    id: 'image',
    title: 'AI 纹样创生',
    description: '输入灵感，生成独一无二的陶瓷花纹/饰品设计图。',
    icon: SparklesIcon,
    color: 'from-purple-400 to-pink-400',
    gate: false,
  },
  {
    id: 'translate',
    title: '全球雅集翻译',
    description: '打破语言界限，与全球陶瓷爱好者交流。',
    icon: LanguageIcon,
    color: 'from-green-400 to-emerald-500',
    gate: false,
  },
  {
    id: 'video',
    title: 'AI 视频生成',
    description: '用AI将你的创意转化为精美短视频，展示陶瓷之美。',
    icon: FilmIcon,
    color: 'from-blue-400 to-cyan-500',
    gate: true, // 创作入口：需刷脸登录 + 余额
  },
] as const;

type ServiceId = (typeof SERVICES)[number]['id'];
type ModalKind = ServiceId | 'face' | 'chat';

/* ---------------------------------------------------------------------------
 * 页面主组件
 * ------------------------------------------------------------------------- */

const AIImageModal = NextDynamic(() => import('@/components/AIImageModal'), { ssr: false });
const VideoModal = NextDynamic(() => import('@/components/VideoModal'), { ssr: false });
const TranslateModal = NextDynamic(() => import('@/components/TranslateModal'), { ssr: false });
const AIChatModal = NextDynamic(() => import('@/components/AIChatModal'), { ssr: false });
const DnaStudio = NextDynamic(() => import('@/components/DnaStudio'), {
  ssr: false,
  loading: () => (
    <div className="h-[440px] rounded-2xl bg-[#0a0e27] border border-white/10 animate-pulse" />
  ),
});

export default function AIWordPressPage() {
  /* ---------- 登录态与余额 ---------- */
  const { user, loading: authLoading, refresh, setUser } = useAuth();
  const userRef = useRef<AuthUser | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // 从充值页返回时自动刷新余额
  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  /* ---------- 弹窗状态 ---------- */
  const [activeModal, setActiveModal] = useState<ModalKind | null>(null);
  const [showFace, setShowFace] = useState(false);
  const [showRecharge, setShowRecharge] = useState(false);
  const pendingActionRef = useRef<'video' | 'studio' | null>(null); // 刷脸/充值完成后回放动作

  /* ---------- 极客创作空间（Cloud Studio）状态 ---------- */
  const [studioState, setStudioState] = useState<'idle' | 'creating' | 'error'>('idle');
  const [studioError, setStudioError] = useState('');

  /* ---------- 电影墙数据 ---------- */
  const [movies, setMovies] = useState<MovieData[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const closeModal = useCallback(() => setActiveModal(null), []);

  /* ================= 电影墙：拉取（防抖去重 + 可中止 + 错误重试） ================= */
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
      const res = await fetch(
        `${WP_API_BASE}/movie?page=${pageNum}&per_page=20&_embed`,
        { signal: ctrl.signal },
      );
      if (!res.ok) throw new Error(`加载失败（HTTP ${res.status}）`);
      const data: MovieData[] = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        setHasMore(false);
      } else {
        setMovies((prev) => {
          const merged = mode === 'replace' ? data : [...prev, ...data];
          return dedupeById(merged);
        });
        pageRef.current = pageNum;
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setLoadError(err instanceof Error ? err.message : '网络异常，请稍后重试');
      }
    } finally {
      inFlightRef.current = false;
      setInitialLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void fetchMovies(1, 'replace');
    return () => abortRef.current?.abort();
  }, [fetchMovies]);

  /* ================= 无限滚动：滚动触底自动加载下一页 ================= */
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !inFlightRef.current && !initialLoading) {
          void fetchMovies(pageRef.current + 1, 'append');
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, initialLoading, fetchMovies]);

  /* ================= 创作入口守卫（刷脸 → 余额 → 执行） ================= */
  const requestCreate = useCallback(
    (kind: 'video' | 'studio') => {
      if (authLoading) return; // 登录态检查中，忽略点击
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
      // studio 由下方按钮直接调用 openStudio
    },
    [authLoading],
  );

  const openService = useCallback(
    (id: ServiceId) => {
      const service = SERVICES.find((s) => s.id === id);
      if (service?.gate) {
        requestCreate('video');
        return;
      }
      setActiveModal(id); // 纹样 / 翻译：完全开放
    },
    [requestCreate],
  );

  /* ================= 极客创作空间：动态创建专属 Cloud Studio ================= */
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
      const res = await fetch('/api/create-ugc-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `创建失败（HTTP ${res.status}）`);
      if (!data?.url) throw new Error('后端未返回工作空间链接');
      window.open(data.url, '_blank', 'noopener,noreferrer');
      setStudioState('idle');
    } catch (err) {
      setStudioState('error');
      setStudioError(err instanceof Error ? err.message : '创建空间失败，请稍后重试');
    }
  }, [authLoading]);

  /* 刷脸成功后：回放被拦截的动作 */
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

  /* ================= DNA 工坊节点动作（真实接线，无假结果） ================= */
  const handleToolAction = useCallback(
    (tool: StudioTool) => {
      const action = tool.action;
      if (!action || action.kind === 'none') return; // 配音/4K：引擎接入中，仅展示
      if (action.kind === 'href') {
        window.location.assign(action.href);
        return;
      }
      if (action.modal === 'chat') setActiveModal('chat'); // 剧本工位：AI 聊天（全站开放）
      else if (action.modal === 'image') openService('image'); // 分镜工位：文生图（开放）
      else if (action.modal === 'video') requestCreate('video'); // 视频工位：创作门槛（刷脸+余额）
    },
    [openService, requestCreate],
  );

  /* ================= 渲染 ================= */
  const featured = movies[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-amber-50 pb-20">
      {/* ---------- 顶部用户条（轻量，不拦截浏览） ---------- */}
      <header className="relative z-20">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-end gap-3">
          {user ? (
            <>
              <Link
                href="/account"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-purple-600 transition-colors"
              >
                <UserCircleIcon className="w-5 h-5" />
                {user.nickname || `用户${user.id}`}
              </Link>
              <span className="text-sm text-purple-600 font-semibold">余额 {user.balance}</span>
              <Link
                href="/recharge"
                className="px-4 py-1.5 rounded-full bg-purple-500 text-white text-sm font-semibold hover:bg-purple-600 transition-colors"
              >
                充值
              </Link>
            </>
          ) : (
            <span className="text-xs text-gray-400">欢迎全球创作者 · 网站全站免费开放浏览</span>
          )}
        </div>
      </header>

      {/* ---------- Hero：左侧 DNA 六工位（Three.js），右侧创作入口 ---------- */}
      <section className="relative py-10 md:py-14 overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-8 items-center">
            {/* 左：DNA 双螺旋粒子工坊 */}
            <div className="relative">
              <DnaStudio onAction={handleToolAction} />
              <p className="mt-2 text-center text-[11px] text-gray-400">
                🧬 六大工位即 DNA 上的发光节点——点击节点查看工位，悬停即高亮（3D 画布，可降级为清单）
              </p>
            </div>

            {/* 右：创作入口文案 */}
            <div className="text-center lg:text-left">
              <div className="inline-block mb-4 px-4 py-1 bg-white/50 rounded-full backdrop-blur-sm text-purple-600 text-sm">
                ✨ AI + WordPress · 全球 UGC AI 影视 SaaS ✨
              </div>
              <h1 className="text-4xl md:text-5xl font-serif font-bold text-gray-800 mb-4 tracking-wide">
                AI-WORDPRESS 创作工坊
              </h1>
              <p className="text-lg text-gray-600 mb-6 leading-relaxed">
                我们不制作影视，我们只提供<b>全套工位</b>：剧本 → 分镜 → 视频 → 配音 →
                后期 → 发布，让全球用户直接在我们的网站把影视作品制作出来并上墙。
              </p>
              <div className="space-y-2.5 mb-7 text-sm text-gray-600">
                <p>🧬 <b>今日可用</b>：剧本工位（AI 聊天）· 分镜工位（文生图）· 视频工位（一键生成）· 发布工位（VOD 上墙）</p>
                <p>⚡ <b>引擎接入中</b>：LTX-2.3 22B 音画同步模型（腾讯云 A100 · ComfyUI）· MiniMax 配音 · WAND 4K 增强</p>
                <p>🌍 算力底座：PVE 调度层 + 腾讯云 GPU 集群（A100 80G / V100 32G），接入后节点自动点亮</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <button
                  type="button"
                  onClick={() => requestCreate('video')}
                  className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold shadow-xl hover:scale-105 transition-transform"
                >
                  🎬 AI 视频 · 一键生成并发布
                </button>
                <Link
                  href="/recharge"
                  className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold shadow-xl hover:scale-105 transition-transform text-center"
                >
                  💰 充值 Credits
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 免费功能卡片（纹样 / 翻译 / 视频生成入口） ---------- */}
      <section className="container mx-auto px-4 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {SERVICES.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.id}
                className="group bg-white rounded-2xl shadow-lg cursor-pointer hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border-2 border-gray-100 hover:border-purple-200"
                onClick={() => openService(s.id)}
              >
                <div className="p-10 text-center">
                  <div
                    className={`w-20 h-20 mx-auto rounded-2xl bg-gradient-to-r ${s.color} flex items-center justify-center mb-6 shadow-xl`}
                  >
                    <Icon className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-gray-800">{s.title}</h3>
                  <p className="text-gray-600 mb-8 leading-relaxed">{s.description}</p>
                  {s.gate && (
                    <p className="text-xs text-amber-500 mb-3">创作入口 · 需刷脸登录并充值</p>
                  )}
                  <div className="inline-flex items-center gap-2 text-purple-600 font-semibold group-hover:gap-3 transition-all">
                    <span>立即体验</span>
                    <span>→</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- 极速AI极客创作空间（Cloud Studio）—— 紫色大按钮 ---------- */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto rounded-3xl overflow-hidden bg-gradient-to-r from-purple-700 via-purple-600 to-fuchsia-600 shadow-2xl relative">
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(circle_at_20%_30%,white,transparent_40%)]" />
          <div className="relative z-10 px-8 md:px-14 py-14 md:py-16 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="text-center md:text-left text-white max-w-xl">
              <div className="inline-flex items-center gap-2 text-sm bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full mb-4">
                <RocketLaunchIcon className="w-4 h-4" /> 专业创作者模式
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-3">极速AI极客创作空间</h2>
              <p className="text-purple-100 leading-relaxed mb-4">
                云端无门槛的 AI 影视生产车间：无需安装 Python、无需高性能显卡、无需腾讯云账号。
                把您的 AI 代码粘贴进 <code className="bg-white/20 px-1.5 py-0.5 rounded text-sm">main.py</code>，
                点击运行，作品经 VOD 转码后自动上墙！
              </p>
              <p className="text-purple-200 text-sm">
                每人专属独立 5GB 云盘 · CodeBuddy / WorkBuddy / 混元大模型开箱即用
              </p>
              {studioState === 'error' && (
                <p className="mt-3 text-amber-200 text-sm">⚠️ {studioError}</p>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => void openStudio()}
                disabled={authLoading || studioState === 'creating'}
                className="px-10 py-4 rounded-2xl bg-white text-purple-700 font-bold text-lg shadow-xl hover:scale-105 hover:shadow-2xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {studioState === 'creating' ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    正在创建您的专属空间…
                  </span>
                ) : (
                  '⚡ 进入极客创作空间'
                )}
              </button>
              <p className="text-purple-200 text-xs text-center">
                首次使用将自动为您分配独立隔离的云端开发环境
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- WE ARE THE WORLD AI 影视 电影墙 ---------- */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-serif font-bold text-gray-800 mb-4 tracking-wider flex items-center justify-center gap-2">
            <span className="w-4 h-4 rounded-full bg-teal-500 inline-block"></span>
            WE ARE THE WORLD AI 影视
          </h2>
          <p className="text-gray-500 text-sm tracking-wide">
            海量 AI 影视持续创作，为全球每个角落的你，呈现视听震撼
          </p>
        </div>

        {initialLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 max-w-6xl mx-auto">
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : loadError && movies.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-xl mb-6">🌍 {loadError}</p>
            <button
              type="button"
              onClick={() => void fetchMovies(1, 'replace')}
              className="px-8 py-3 rounded-full bg-purple-500 text-white font-semibold hover:bg-purple-600 transition-colors"
            >
              重新加载
            </button>
          </div>
        ) : movies.length === 0 ? (
          <div className="text-center py-20 text-gray-400">暂无 AI 影视作品，请等候后台自动生成。</div>
        ) : (
          <>
            {/* 最新 AI 热映（第一张卡片大图） */}
            {featured && (
              <div className="max-w-6xl mx-auto mb-16 relative group rounded-2xl overflow-hidden shadow-2xl bg-gray-900">
                <SafeImage
                  src={featured._embedded?.['wp:featuredmedia']?.[0]?.source_url || PLACEHOLDER_POSTER}
                  alt={stripHtml(featured.title.rendered)}
                  className="w-full h-[400px] md:h-[500px] object-cover opacity-80 group-hover:opacity-70 transition-opacity"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                <div className="absolute bottom-10 left-10 right-10 text-white z-10">
                  <span className="bg-purple-600 text-xs px-2 py-1 rounded-md mb-2 inline-block">
                    🔥 最新 AI 热映
                  </span>
                  <h2 className="text-3xl md:text-4xl font-bold">
                    {stripHtml(featured.title.rendered)}
                  </h2>
                  <p className="text-gray-300 mt-2 text-sm">
                    作者：@
                    {featured.author_name ||
                      (featured.author_user_id ? `创作者 ${featured.author_user_id}` : '匿名创作者')}
                    {featured.movie_genre?.[0]?.name ? ` · ${featured.movie_genre[0].name}` : ''}
                    {formatDate(featured.date) ? ` · ${formatDate(featured.date)}` : ''}
                  </p>
                  {(() => {
                    const slug = resolveSlug(featured);
                    const href = slug ? `/movie/${encodeURIComponent(slug)}` : featured.link;
                    return (
                      <Link
                        href={href}
                        {...(slug ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                        className="mt-4 inline-block bg-white text-black px-6 py-2 rounded-full font-semibold hover:bg-gray-200 transition"
                      >
                        立即观看 →
                      </Link>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* 最新上架 AI 短剧 */}
            <div className="max-w-6xl mx-auto">
              <h3 className="text-2xl font-bold mb-6 border-l-4 border-purple-500 pl-3">
                🎬 最新上架 AI 短剧
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {movies.map((m) => (
                  <MovieCard key={m.id} movie={m} />
                ))}
              </div>
            </div>

            {/* 加载更多 */}
            <div ref={sentinelRef} className="flex justify-center mt-16">
              {loadError && movies.length > 0 && (
                <p className="text-sm text-red-400 mb-3">{loadError}</p>
              )}
              {loadingMore ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <span className="w-5 h-5 border-2 border-purple-300 border-t-purple-500 rounded-full animate-spin" />
                  正在加载更多 AI 宇宙…
                </div>
              ) : hasMore ? (
                <button
                  type="button"
                  onClick={() => void fetchMovies(pageRef.current + 1, 'append')}
                  className="px-10 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                >
                  ↓ 向下无限浏览 ↓
                </button>
              ) : (
                <p className="text-gray-400 text-sm">
                  ✨ 已经抵达 AI 影视的宇宙边缘，敬请等待新作诞生 ✨
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {/* ---------- 弹窗（AI 视频生成已加创作门槛；纹样/翻译/聊天免费开放） ---------- */}
      {activeModal === 'image' && <AIImageModal onClose={closeModal} />}
      {activeModal === 'translate' && <TranslateModal onClose={closeModal} />}
      {activeModal === 'chat' && <AIChatModal onClose={closeModal} />}
      {activeModal === 'video' && <VideoModal onClose={closeModal} />}

      {/* 刷脸注册/登录（唯一注册方式） */}
      <FaceAuthModal open={showFace} onClose={() => setShowFace(false)} onSuccess={onFaceSuccess} />

      {/* 充值引导 */}
      <RechargeGate
        open={showRecharge}
        onClose={() => setShowRecharge(false)}
        balance={user?.balance ?? 0}
      />

      <ClientOnly>
        <FloatingChat />
      </ClientOnly>
    </div>
  );
}

/**
 * ============================================================================
 * 【配套】WordPress functions.php 片段 —— 让电影墙能拿到作者信息
 * 将以下代码加入主题 functions.php 或一个自定义插件，REST 返回里就会出现
 * author_user_id / author_name，前端即可显示「作者：@xxx」。
 * ============================================================================
 *
 * add_action('rest_api_init', function () {
 *   register_rest_field('movie', 'author_user_id', [
 *     'get_callback' => fn($obj) => get_post_meta($obj['id'], 'author_user_id', true),
 *     'schema'       => ['type' => ['integer', 'string', 'null']],
 *   ]);
 *   register_rest_field('movie', 'author_name', [
 *     'get_callback' => function ($obj) {
 *       $uid = (int) get_post_meta($obj['id'], 'author_user_id', true);
 *       $u = $uid ? get_userdata($uid) : null;
 *       return $u ? $u->display_name : null;
 *     },
 *     'schema' => ['type' => ['string', 'null']],
 *   ]);
 * });
 */
