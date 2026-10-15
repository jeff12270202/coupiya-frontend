'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
// 引入 video.js 及其 CSS
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

// === 1. 绝对的兜底海报（直接内嵌SVG，任何网络断开都能显示） ===
const PLACEHOLDER_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%231a1a2e'/%3E%3Cstop offset='100%25' style='stop-color:%2316213e'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='600' fill='url(%23bg)'/%3E%3Ctext x='200' y='280' text-anchor='middle' fill='%23e94560' font-family='Arial' font-size='64' font-weight='bold'%3E🎬%3C/text%3E%3Ctext x='200' y='340' text-anchor='middle' fill='%238a8a9a' font-family='Arial' font-size='20'%3ECOUPIYA%3C/text%3E%3Ctext x='200' y='370' text-anchor='middle' fill='%235a5a6a' font-family='Arial' font-size='14'%3EAI MOVIE%3C/text%3E%3C/svg%3E";

// === 2. 视频源绝对解析器（极其稳健） ===
function extractVideoUrl(sources: unknown): string | null {
  if (!sources) return null;
  try {
    if (typeof sources === 'string') {
      if (sources.startsWith('[') || sources.startsWith('{')) {
        const parsed = JSON.parse(sources);
        if (Array.isArray(parsed)) return parsed[0]?.url || parsed[0] || null;
        return parsed.url || null;
      }
      if (sources.startsWith('http')) return sources;
      return null;
    }
    if (Array.isArray(sources)) return sources[0]?.url || sources[0] || null;
    if (typeof sources === 'object' && sources !== null) {
      const obj = sources as any;
      return obj.url || obj.src || obj.link || obj.source_url || obj.video_url || obj.mp4 || obj.webm || null;
    }
  } catch (e) {}
  return null;
}

// === 3. 从 content.rendered 中尝试提取视频地址（多种来源，修复了 TS 报错） ===
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

// === 4. 带错误静默处理的海报组件 ===
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

  // 新增：用于 video.js 的 ref
  const videoRef = useRef<HTMLVideoElement>(null);

  // 拉取数据逻辑
  useEffect(() => {
    if (!slugFromRoute) { setLoading(false); setDebugMsg('未找到影片ID'); return; }

    // 【CORS 修复】浏览器端走同源代理 /api/wp（见 next.config.js rewrites），
    // 由 Next.js 服务端转发到 https://blog.coupiya.com/wp-json/wp/v2。
    // 原因：blog.coupiya.com 对 Origin: http://localhost:3000 不返回
    //       Access-Control-Allow-Origin，浏览器直连会报 "Failed to fetch"。
    const WP_API =
      typeof window !== 'undefined'
        ? '/api/wp'
        : (process.env.NEXT_PUBLIC_WP_API_URL || 'https://blog.coupiya.com/wp-json/wp/v2').replace(/\/+$/, '');
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

  // 提取海报和视频源
  const posterUrl = movie?._embedded?.['wp:featuredmedia']?.[0]?.source_url || movie?.featured_image_url || null;
  let videoUrl = extractVideoUrl(movie?.meta?._sources);
  if (!videoUrl && movie?.content?.rendered) {
    videoUrl = extractVideoFromContent(movie.content.rendered);
  }

  const cleanContent = (movie?.content?.rendered || '')
    .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '')
    .replace(/<video[^>]*>[\s\S]*?<\/video>/gi, '')
    .replace(/\[[^\]]*\]/g, '').replace(/<[^>]+>/g, '').trim();

  // ★ 核心新增：使用 video.js 初始化播放器（完美支持手机端 HLS 播放） ★
  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;

    // 初始化 video.js 播放器
    const player = videojs(videoRef.current, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      fluid: true,
      // 根据 URL 自动识别是 mp4 还是 hls (m3u8)
      sources: [{
        src: videoUrl,
        type: videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
      }]
    });

    // 组件销毁时清理播放器实例，防止内存泄漏
    return () => {
      if (player) player.dispose();
    };
  }, [videoUrl]);

  if (loading) return <div className="container mx-auto px-4 py-20 text-center animate-pulse">🌍 正在加载...</div>;
  if (!movie) return (
    <div className="container mx-auto px-4 py-20 text-center">
      <p className="text-xl text-gray-500">{debugMsg}</p>
      <Link href="/blog" className="inline-block mt-4 px-6 py-2 bg-purple-600 text-white rounded-full">← 返回影视列表</Link>
    </div>
  );

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

          {/* ★ 绝对播放器容器 ★ */}
          <div className="mt-4 aspect-video bg-black rounded-xl overflow-hidden shadow-lg relative flex items-center justify-center">
            {videoUrl ? (
              /* 使用 video.js 渲染播放器 (替换原生的 <video> 标签) */
              <div className="w-full h-full">
                <video 
                  ref={videoRef} 
                  className="video-js vjs-default-skin vjs-big-play-centered w-full h-full" 
                />
              </div>
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