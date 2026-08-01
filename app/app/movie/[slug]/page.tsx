import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

const PLACEHOLDER_POSTER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%231a1a2e'/%3E%3Cstop offset='100%25' style='stop-color:%2316213e'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='600' fill='url(%23bg)'/%3E%3Ctext x='200' y='280' text-anchor='middle' fill='%23e94560' font-family='Arial' font-size='64' font-weight='bold'%3E🎬%3C/text%3E%3Ctext x='200' y='340' text-anchor='middle' fill='%238a8a9a' font-family='Arial' font-size='20'%3ECOUPIYA%3C/text%3E%3Ctext x='200' y='370' text-anchor='middle' fill='%235a5a6a' font-family='Arial' font-size='14'%3EAI MOVIE%3C/text%3E%3C/svg%3E";

/**
 * 稳健地解析 WordPress meta._sources 视频地址
 * _sources 可能是：
 *   1. 纯字符串 URL
 *   2. JSON 字符串数组/对象（序列化数据）
 *   3. 数组
 *   4. 对象 { url, src, file } 等
 */
function extractVideoUrl(sources: unknown): string | null {
  if (!sources) return null;

  // 情况1: 纯字符串 URL
  if (typeof sources === 'string') {
    const trimmed = sources.trim();
    // 如果是 JSON 字符串，尝试解析
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return extractVideoUrl(JSON.parse(trimmed));
      } catch {
        // 不是有效 JSON，直接当作 URL 返回
        return trimmed.startsWith('http') ? trimmed : null;
      }
    }
    return trimmed.startsWith('http') ? trimmed : null;
  }

  // 情况2: 数组 → 取第一个有效 URL
  if (Array.isArray(sources)) {
    for (const item of sources) {
      const url = extractVideoUrl(item);
      if (url) return url;
    }
    return null;
  }

  // 情况3: 对象 { url, src, file, link, source_url ... }
  if (typeof sources === 'object' && sources !== null) {
    const obj = sources as Record<string, unknown>;
    const candidateKeys = ['url', 'src', 'file', 'link', 'source_url', 'video_url', 'mp4', 'webm'];
    for (const key of candidateKeys) {
      const val = obj[key];
      if (typeof val === 'string' && val.startsWith('http')) {
        return val;
      }
    }
  }

  return null;
}

export default async function MoviePage({ params }: { params: { slug: string } }) {
  const res = await fetch(
    `https://blog.coupiya.com/wp-json/wp/v2/movie?slug=${encodeURIComponent(params.slug)}&_embed`,
    { next: { revalidate: 60 } }
  );

  if (!res.ok) {
    return (
      <div className="container mx-auto px-4 py-20 text-center text-gray-500">
        <p className="text-xl">🎬 影片加载失败，请稍后重试</p>
        <Link href="/blog" className="mt-4 inline-block text-purple-600 hover:underline">
          ← 返回影视列表
        </Link>
      </div>
    );
  }

  const movies = await res.json();
  const movie = movies[0];
  if (!movie) return notFound();

  const posterUrl =
    movie._embedded?.['wp:featuredmedia']?.[0]?.source_url ||
    movie.featured_image_url ||
    null;

  const videoUrl = extractVideoUrl(movie.meta?._sources);

  // 如果没有视频 URL，尝试从 content 中提取 <video> 标签
  let fallbackVideoUrl: string | null = null;
  if (!videoUrl && movie.content?.rendered) {
    const match = movie.content.rendered.match(/<video[^>]*src=["']([^"']+)["']/i);
    if (match) fallbackVideoUrl = match[1];
  }

  const finalVideoUrl = videoUrl || fallbackVideoUrl;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* 返回链接 */}
      <Link
        href="/blog"
        className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 mb-6 transition-colors"
      >
        ← 返回影视列表
      </Link>

      <h1 className="text-4xl font-bold mb-6">{movie.title.rendered}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 海报区域 */}
        <div className="relative aspect-[2/3] bg-gray-200 rounded-xl overflow-hidden shadow-lg">
          <Image
            src={posterUrl || PLACEHOLDER_POSTER}
            alt={movie.title.rendered}
            fill
            className="object-cover"
            onError={(e) => {
              // 图片加载失败时替换为占位图
              const target = e.currentTarget as HTMLImageElement;
              if (target.src !== PLACEHOLDER_POSTER) {
                target.src = PLACEHOLDER_POSTER;
              }
            }}
          />
        </div>

        {/* 内容与播放器区域 */}
        <div className="flex flex-col gap-4">
          <div className="text-gray-500 text-sm">
            📅 {new Date(movie.date).toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>

          <div
            className="prose prose-gray max-w-none text-gray-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: movie.content?.rendered || '<p>暂无简介</p>' }}
          />

          {/* 视频播放器 */}
          {finalVideoUrl ? (
            <div className="mt-4 aspect-video bg-black rounded-xl overflow-hidden shadow-lg">
              <video
                key={finalVideoUrl}
                src={finalVideoUrl}
                controls
                className="w-full h-full"
                poster={posterUrl || PLACEHOLDER_POSTER}
                preload="metadata"
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
