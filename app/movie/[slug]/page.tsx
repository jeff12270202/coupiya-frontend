'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';

/* ---------- 内联 SVG 占位图 ---------- */
const PLACEHOLDER_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%231a1a2e'/%3E%3Cstop offset='100%25' style='stop-color:%2316213e'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='600' fill='url(%23bg)'/%3E%3Ctext x='200' y='280' text-anchor='middle' fill='%23e94560' font-family='Arial' font-size='64' font-weight='bold'%3E🎬%3C/text%3E%3Ctext x='200' y='340' text-anchor='middle' fill='%238a8a9a' font-family='Arial' font-size='20'%3ECOUPIYA%3C/text%3E%3Ctext x='200' y='370' text-anchor='middle' fill='%235a5a6a' font-family='Arial' font-size='14'%3EAI MOVIE%3C/text%3E%3C/svg%3E";

/* ---------- 从任意数据源提取视频 URL ---------- */
function extractVideoUrl(sources: unknown): string | null {
  if (!sources) return null;
  if (typeof sources === 'string') {
    const s = sources.trim();
    if (!s) return null;
    if (s.startsWith('[') || s.startsWith('{')) {
      try { return extractVideoUrl(JSON.parse(s)); } catch { if (s.startsWith('http')) return s; }
    }
    if (s.startsWith('http')) return s;
    return null;
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

/** 从 content.rendered 中尝试提取视频地址（多种来源） */
function extractVideoFromContent(html: string): string | null {
  // 1. <video src="...">
  let m = html.match(/<video[^>]*\ssrc=["']([^"']+\.(?:mp4|webm|ogg|m3u8))["']/i);
  if (m) return m[1] || null;

  // 2. <source src="...">
  m = html.match(/<source[^>]*\ssrc=["']([^"']+)["']/i);
  if (m) return m[1] || null;

  // 3. Presto Player / bunny.net 嵌入
  m = html.match(/(?:iframe|src)=["'](https?:\/\/iframe\.mediadelivery\.net\/[^"']+)["']/i);
  if (m) return m[1] || null;

  // 4. 任意 iframe src
  m = html.match(/<iframe[^>]*\ssrc=["'](https?:[^"']+)["']/i);
  if (m) return m[1] || null;

  // 5. WP 视频块短代码 [video src="..." /]
  m = html.match(/\[video[^\]]*\ssrc=["']([^"']+)["']/i);
  if (m) return m[1] || null;

  // 6. 任何裸露的 mp4/m3u8 URL
  m = html.match(/https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8|webm|ogg)\b/i);
  if (m) return m[0] || null;

  return null;
}

/* ---------- SafeImage ---------- */
function SafeImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return <img src={PLACEHOLDER_POSTER} alt={alt} className={className} />;
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={className}
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}

/* ================================================================
   页面主体
   ================================================================ */
export default function MoviePage() {
  const params = useParams<{ slug: string }>();
  // Next.js 自动解码路由参数，所以 params.slug 可能已经是中文
  const slugFromRoute = params?.slug ?? '';

  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slugFromRoute) { setLoading(false); setError('empty'); return; }

    const WP_API = process.env.NEXT_PUBLIC_WP_API_URL || 'https://blog.coupiya.com/wp-json/wp/v2';
    // 对可能已是中文的 slug 再次 encode 以确保传给 API 时是安全的
    const encodedSlug = encodeURIComponent(slugFromRoute);
    const url = `${WP_API}/movie?slug=${encodedSlug}&_embed`;

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
  }, [slugFromRoute]);

  /* ---------- 加载 / 错误 / 空 ---------- */
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 text-center text-gray-400 animate-pulse">
        🌍 正在加载影片数据...
      </div>
    );
  }
  if (error || !movie) {
    const msg = error === 'empty'
      ? { icon: '🔍', title: '未找到该影片', desc: '请尝试从影视列表重新进入。' }
      : error === 'timeout'
      ? { icon: '⏳', title: '请求超时', desc: 'API 响应超时，请稍后重试。' }
      : { icon: '🎬', title: '加载失败', desc: '请检查网络后重试。' };
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

  /* ---------- 数据提取 ---------- */
  const posterUrl =
    movie._embedded?.['wp:featuredmedia']?.[0]?.source_url ||
    movie.featured_image_url ||
    null;

  const videoUrl =
    extractVideoUrl(movie.meta?._sources) ||
    (movie.content?.rendered && extractVideoFromContent(movie.content.rendered)) ||
    null;

  // 从 content 中提取纯文本简介（移除 HTML 和短代码）
  const rawContent: string = movie.content?.rendered || '';
  const cleanContent = rawContent
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, '')
    .replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Link href="/blog" className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 mb-6 transition-colors">
        ← 返回影视列表
      </Link>

      <h1 className="text-4xl font-bold mb-6">{movie.title?.rendered || '未命名影片'}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 海报 */}
        <div className="relative aspect-[2/3] bg-gray-200 rounded-xl overflow-hidden shadow-lg">
          <SafeImage src={posterUrl || PLACEHOLDER_POSTER} alt={movie.title?.rendered || '海报'} className="object-cover" />
        </div>

        {/* 详情 + 播放器 */}
        <div className="flex flex-col gap-4">
          <div className="text-gray-500 text-sm">
            📅 {movie.date ? new Date(movie.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : '未知日期'}
          </div>

          {/* 简介（纯文本） */}
          {cleanContent && (
            <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed text-sm">
              {cleanContent}
            </div>
          )}

          {/* 视频播放器 */}
          {videoUrl ? (
            <div className="mt-4 aspect-video bg-black rounded-xl overflow-hidden shadow-lg">
              {videoUrl.includes('mediadelivery.net') || videoUrl.includes('<iframe') ? (
                <iframe
                  src={videoUrl}
                  className="w-full h-full"
                  allowFullScreen
                  allow="autoplay; fullscreen"
                  title="视频播放器"
                />
              ) : (
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
              )}
            </div>
          ) : (
            /* 没有视频时，展示 content HTML 中的富文本（保留 WP 编辑器内容） */
            rawContent && (
              <div className="mt-4 prose prose-gray max-w-none text-gray-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: rawContent }}
              />
            )
          )}

          {/* 完全没有内容 */}
          {!videoUrl && !rawContent && (
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