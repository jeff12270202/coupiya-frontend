'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';

/* ---------- 内联 SVG 占位图 ---------- */
const PLACEHOLDER_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%231a1a2e'/%3E%3Cstop offset='100%25' style='stop-color:%2316213e'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='600' fill='url(%23bg)'/%3E%3Ctext x='200' y='280' text-anchor='middle' fill='%23e94560' font-family='Arial' font-size='64' font-weight='bold'%3E🎬%3C/text%3E%3Ctext x='200' y='340' text-anchor='middle' fill='%238a8a9a' font-family='Arial' font-size='20'%3ECOUPIYA%3C/text%3E%3Ctext x='200' y='370' text-anchor='middle' fill='%235a5a6a' font-family='Arial' font-size='14'%3EAI MOVIE%3C/text%3E%3C/svg%3E";

/* ---------- 从 WordPress meta._sources 中提取视频 URL ---------- */
function extractVideoUrl(sources: unknown): string | null {
  if (!sources) return null;
  if (typeof sources === 'string') {
    const s = sources.trim();
    if (!s) return null;
    if (s.startsWith('[') || s.startsWith('{')) {
      try { return extractVideoUrl(JSON.parse(s)); } catch { return s.startsWith('http') ? s : null; }
    }
    return s.startsWith('http') ? s : null;
  }
  if (Array.isArray(sources)) {
    for (const item of sources) { const u = extractVideoUrl(item); if (u) return u; }
    return null;
  }
  if (typeof sources === 'object' && sources !== null) {
    const obj = sources as Record<string, unknown>;
    for (const k of ['url','src','file','link','source_url','video_url','mp4','webm']) {
      const v = obj[k];
      if (typeof v === 'string') {
        if (v.startsWith('http')) return v;
        if (v.startsWith('//')) return `https:${v}`;
      }
    }
  }
  return null;
}

/* ---------- 图片组件：自带 onError 回退 ---------- */
function SafeImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [imgSrc, setImgSrc] = useState(src || PLACEHOLDER_POSTER);
  const [hasError, setHasError] = useState(false);

  if (!src || src === PLACEHOLDER_POSTER || hasError) {
    // 直接渲染占位 SVG，避免 Next.js Image 对 data: 的二次请求
    return (
      <img src={PLACEHOLDER_POSTER} alt={alt} className={className} />
    );
  }

  return (
    <Image
      src={imgSrc}
      alt={alt}
      fill
      className={className}
      unoptimized
      onError={() => {
        setHasError(true);
        setImgSrc(PLACEHOLDER_POSTER);
      }}
    />
  );
}

/* ================================================================
   页面主体
   ================================================================ */
export default function MoviePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* 客户端 fetch，因为要用 AbortSignal */
  useState(() => {
    const WP_API = process.env.NEXT_PUBLIC_WP_API_URL || 'https://blog.coupiya.com/wp-json/wp/v2';
    const url = `${WP_API}/movie?slug=${encodeURIComponent(slug ?? '')}&_embed`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);

    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        clearTimeout(t);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
          setError('empty');
        } else {
          setMovie(data[0]);
        }
      })
      .catch((e) => {
        clearTimeout(t);
        console.error('[MoviePage] fetch error:', e);
        setError(e.name === 'AbortError' ? 'timeout' : 'network');
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  });

  /* ---------- 加载态 ---------- */
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 text-center text-gray-400">
        <div className="animate-pulse">🌍 正在加载影片数据...</div>
      </div>
    );
  }

  /* ---------- 错误 / 空结果 ---------- */
  if (error || !movie) {
    const msg =
      error === 'empty'
        ? { icon: '🔍', title: '未找到该影片', desc: '该影片可能已被移除或链接有误。' }
        : error === 'timeout'
        ? { icon: '⏳', title: '请求超时', desc: 'API 响应时间过长，请稍后重试。' }
        : { icon: '🎬', title: '影片数据加载失败', desc: '请检查网络连接后重试。' };

    return (
      <div className="container mx-auto px-4 py-20 text-center text-gray-500">
        <span className="text-4xl block mb-4">{msg.icon}</span>
        <p className="text-xl mb-2">{msg.title}</p>
        <p className="text-sm text-gray-400 mb-6">{msg.desc}</p>
        <Link href="/blog" className="inline-block px-6 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition">
          ← 返回影视列表
        </Link>
      </div>
    );
  }

  /* ---------- 正常渲染 ---------- */
  const posterUrl =
    movie._embedded?.['wp:featuredmedia']?.[0]?.source_url ||
    movie.featured_image_url ||
    null;

  const videoUrl =
    extractVideoUrl(movie.meta?._sources) ||
    (movie.content?.rendered && movie.content.rendered.match(/<video[^>]*src=["']([^"']+)["']/i))?.[1] ||
    null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Link href="/blog" className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 mb-6 transition-colors">
        ← 返回影视列表
      </Link>

      <h1 className="text-4xl font-bold mb-6">
        {movie.title?.rendered || '未命名影片'}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 海报 */}
        <div className="relative aspect-[2/3] bg-gray-200 rounded-xl overflow-hidden shadow-lg">
          <SafeImage
            src={posterUrl || PLACEHOLDER_POSTER}
            alt={movie.title?.rendered || '影片海报'}
            className="object-cover"
          />
        </div>

        {/* 详情 + 播放器 */}
        <div className="flex flex-col gap-4">
          <div className="text-gray-500 text-sm">
            📅 {movie.date
              ? new Date(movie.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
              : '未知日期'}
          </div>

          <div
            className="prose prose-gray max-w-none text-gray-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: movie.content?.rendered || '<p>暂无简介</p>' }}
          />

          {videoUrl ? (
            <div className="mt-4 aspect-video bg-black rounded-xl overflow-hidden shadow-lg">
              <video
                src={videoUrl}
                controls
                className="w-full h-full"
                poster={posterUrl || undefined}
                preload="metadata"
                crossOrigin="anonymous"
              >
                您的浏览器不支持视频播放。
              </video>
            </div>
          ) : (
            <div className="mt-4 aspect-video bg-gray-800 rounded-xl flex items-center justify-center text-gray-400 shadow-lg">
              <div className="text-center">
                <span className="text-4xl block mb-2">🎬</span>
                <p>暂无视频源</p>
                <p className="text-xs mt-1">该影片可能还在制作中</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}