'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';

// === 1. 绝对的兜底海报（直接内嵌SVG，任何网络断开都能显示） ===
const PLACEHOLDER_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%231a1a2e'/%3E%3Cstop offset='100%25' style='stop-color:%2316213e'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='600' fill='url(%23bg)'/%3E%3Ctext x='200' y='280' text-anchor='middle' fill='%23e94560' font-family='Arial' font-size='64' font-weight='bold'%3E🎬%3C/text%3E%3Ctext x='200' y='340' text-anchor='middle' fill='%238a8a9a' font-family='Arial' font-size='20'%3ECOUPIYA%3C/text%3E%3Ctext x='200' y='370' text-anchor='middle' fill='%235a5a6a' font-family='Arial' font-size='14'%3EAI MOVIE%3C/text%3E%3C/svg%3E";

// === 2. 视频源绝对解析器（极其稳健） ===
function extractVideoUrl(sources: unknown): string | null {
  if (!sources) return null;
  try {
    // 如果传入的是字符串，直接解析JSON或者返回字符串
    if (typeof sources === 'string') {
      if (sources.startsWith('[') || sources.startsWith('{')) {
        const parsed = JSON.parse(sources);
        if (Array.isArray(parsed)) return parsed[0]?.url || parsed[0] || null;
        return parsed.url || null;
      }
      if (sources.startsWith('http')) return sources;
      return null;
    }
    // 数组或对象的情况
    if (Array.isArray(sources)) return sources[0]?.url || sources[0] || null;
    if (typeof sources === 'object' && sources !== null) {
      const obj = sources as any;
      return obj.url || obj.src || obj.link || obj.source_url || obj.video_url || obj.mp4 || obj.webm || null;
    }
  } catch (e) {}
  return null;
}

// === 3. 带错误静默处理的海报组件 ===
function SafeImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) return <img src={PLACEHOLDER_POSTER} alt={alt} className={className} />;
  return <Image src={src} alt={alt} fill className={className} unoptimized onError={() => setFailed(true)} />;
}

// ================================================================
// 页面主体
// ================================================================
export default function MoviePage() {
  const params = useParams<{ slug: string }>();
  const slugFromRoute = params?.slug ?? '';
  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [debugMsg, setDebugMsg] = useState('加载中...');

  useEffect(() => {
    if (!slugFromRoute) { setLoading(false); setDebugMsg('未找到影片ID'); return; }

    const WP_API = process.env.NEXT_PUBLIC_WP_API_URL || 'https://blog.coupiya.com/wp-json/wp/v2';
    const encodedSlug = encodeURIComponent(slugFromRoute);
    const url = `${WP_API}/movie?slug=${encodedSlug}&_embed`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
          setDebugMsg('未找到该影片');
        } else {
          setMovie(data[0]);
          setDebugMsg('数据获取成功');
        }
      })
      .catch((e) => { setDebugMsg(`网络请求错误: ${e.message}`); console.error(e); })
      .finally(() => setLoading(false));
  }, [slugFromRoute]);

  if (loading) return <div className="container mx-auto px-4 py-20 text-center animate-pulse">🌍 正在加载...</div>;
  if (!movie) return (
    <div className="container mx-auto px-4 py-20 text-center">
      <p className="text-xl text-gray-500">{debugMsg}</p>
      <Link href="/blog" className="inline-block mt-4 px-6 py-2 bg-purple-600 text-white rounded-full">← 返回影视列表</Link>
    </div>
  );

  const posterUrl = movie._embedded?.['wp:featuredmedia']?.[0]?.source_url || movie.featured_image_url || null;
  let videoUrl = extractVideoUrl(movie.meta?._sources);
  // 兜底正则抓取（万一 _sources 是空的）
  if (!videoUrl) {
    const html = movie.content?.rendered || '';
    const m = html.match(/https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8|webm|ogg)\b/i);
    videoUrl = m ? m[0] : null;
  }

  const cleanContent = (movie.content?.rendered || '')
    .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '')
    .replace(/<video[^>]*>[\s\S]*?<\/video>/gi, '')
    .replace(/\[[^\]]*\]/g, '').replace(/<[^>]+>/g, '').trim();

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 返回按钮 */}
      <Link href="/blog" className="inline-flex items-center text-sm text-purple-600 hover:text-purple-800 mb-6 transition-colors">← 返回影视列表</Link>

      {/* 标题 */}
      <h1 className="text-3xl md:text-4xl font-bold mb-4">{movie.title?.rendered || '未命名影片'}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 左侧海报 */}
        <div className="relative aspect-[2/3] bg-gray-200 rounded-xl overflow-hidden shadow-lg">
          <SafeImage src={posterUrl || PLACEHOLDER_POSTER} alt="海报" className="object-cover" />
        </div>

        {/* 右侧信息及视频播放器 */}
        <div className="flex flex-col gap-4">
          <div className="text-gray-500 text-sm">
            📅 {movie.date ? new Date(movie.date).toLocaleDateString('zh-CN') : '未知日期'}
          </div>
          {cleanContent && <div className="text-gray-700 text-sm leading-relaxed">{cleanContent}</div>}

          {/* 绝对播放器容器 */}
          <div className="mt-4 aspect-video bg-black rounded-xl overflow-hidden shadow-lg relative flex items-center justify-center">
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                className="w-full h-full object-contain"
                poster={posterUrl || undefined}
                crossOrigin="anonymous"
                playsInline // 保证手机端不自动全屏
              >
                您的浏览器不支持视频播放。
              </video>
            ) : (
              <div className="text-center text-gray-500">
                <span className="text-4xl block mb-2">🎬</span>
                <p className="text-sm">暂无视频源或视频加载失败</p>
                <p className="text-xs mt-1 text-gray-600 opacity-70">(后台调试: {debugMsg})</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}