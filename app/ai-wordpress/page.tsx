'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import NextDynamic from 'next/dynamic';
import {
  SparklesIcon,
  LanguageIcon,
  FilmIcon,
} from '@heroicons/react/24/outline';
import FloatingChat from '@/components/FloatingChat';
import ClientOnly from '@/components/ClientOnly';

const AIImageModal = NextDynamic(() => import('@/components/AIImageModal'), { ssr: false });
const VideoModal = NextDynamic(() => import('@/components/VideoModal'), { ssr: false });
const TranslateModal = NextDynamic(() => import('@/components/TranslateModal'), { ssr: false });

// ✅ 保留原卡片的静态数据（绝不动）
const SERVICES = [
  {
    id: 'image',
    title: 'AI 纹样创生',
    description: '输入灵感，生成独一无二的陶瓷花纹/饰品设计图。',
    icon: SparklesIcon,
    color: 'from-purple-400 to-pink-400',
    modal: 'image',
  },
  {
    id: 'translate',
    title: '全球雅集翻译',
    description: '打破语言界限，与全球陶瓷爱好者交流。',
    icon: LanguageIcon,
    color: 'from-green-400 to-emerald-500',
    modal: 'translate',
  },
  {
    id: 'video',
    title: 'AI 视频生成',
    description: '用AI将你的创意转化为精美短视频，展示陶瓷之美。',
    icon: FilmIcon,
    color: 'from-blue-400 to-cyan-500',
    modal: 'video',
  },
];

interface MovieData {
  id: number;
  title: { rendered: string };
  link: string;
  _embedded?: {
    'wp:featuredmedia'?: Array<{ source_url: string }>;
  };
  movie_genre?: Array<{ id: number; name: string }>;
}

export default function AIWordPressPage() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const closeModal = () => setActiveModal(null);

  const [movies, setMovies] = useState<MovieData[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);

  const fetchMovies = useCallback(async (pageNum: number, append = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `https://blog.coupiya.com/wp-json/wp/v2/movie?page=${pageNum}&per_page=20&_embed`
      );
      if (!res.ok) throw new Error('Failed to fetch movies');
      const data = await res.json();
      if (data.length === 0) {
        setHasMore(false);
      } else {
        setMovies((prev) => (append ? [...prev, ...data] : data));
      }
    } catch (error) {
      console.error('🎬 拉取全球 AI 影视数据失败:', error);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    fetchMovies(1, false);
  }, []);

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchMovies(nextPage, true);
    }
  };

  const MovieCard = ({ movie }: { movie: MovieData }) => (
    <div className="group relative bg-white rounded-xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
      <div className="relative aspect-[2/3] overflow-hidden bg-gray-200">
        <img
          src={movie._embedded?.['wp:featuredmedia']?.[0]?.source_url || 'https://placehold.co/300x450/222/fff?text=AI+Movie'}
          alt={movie.title.rendered}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 group-hover:brightness-75"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-black shadow-lg hover:bg-purple-500 hover:text-white transition-colors">
            ▶
          </div>
        </div>
      </div>
      <div className="p-3">
        <h4 className="font-bold text-gray-800 text-sm truncate" title={movie.title.rendered}>
          {movie.title.rendered}
        </h4>
        <div className="flex justify-between items-center mt-2 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">⭐ 9.0 <span className="text-gray-400 text-[8px]">AI</span></span>
          <span>12 分钟</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-amber-50 pb-20">
      {/* 保留原样：Hero 区 */}
      <section className="relative py-24 overflow-hidden">
        <div className="container mx-auto px-4 text-center relative z-10">
          <div className="inline-block mb-4 px-4 py-1 bg-white/50 rounded-full backdrop-blur-sm text-purple-600 text-sm">
            ✨ AI + WordPress ✨
          </div>
          <h1 className="text-5xl font-serif font-bold text-gray-800 mb-4">AI-WORDPRESS 创作工坊</h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            结合 AI 智能与 WordPress 强大内容管理系统，为您的创作赋能
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {SERVICES.map((service) => (
            <div
              key={service.id}
              className="group bg-white rounded-2xl shadow-lg cursor-pointer hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border-2 border-gray-100 hover:border-purple-200"
              onClick={() => setActiveModal(service.modal)}
            >
              <div className="p-10 text-center">
                <div className={`w-20 h-20 mx-auto rounded-2xl bg-gradient-to-r ${service.color} flex items-center justify-center mb-6 shadow-xl`}>
                  <service.icon className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-gray-800">{service.title}</h3>
                <p className="text-gray-600 mb-8 leading-relaxed">{service.description}</p>
                <div className="inline-flex items-center gap-2 text-purple-600 font-semibold group-hover:gap-3 transition-all">
                  <span>立即体验</span>
                  <span>→</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 🌍 全球顶级 AI 影视流媒区 */}
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
          <div className="text-center py-20 text-gray-400 text-xl">🌍 正在召唤全球 AI 影视巨作...</div>
        ) : movies.length === 0 ? (
          <div className="text-center py-20 text-gray-400">暂无 AI 影视作品，请等候后台自动生成。</div>
        ) : (
          <>
            {/* 1. 首屏大图推荐（修正了红线，使用 ! 非空断言） */}
            {movies.length > 0 && (
              <div className="max-w-6xl mx-auto mb-16 relative group rounded-2xl overflow-hidden shadow-2xl bg-gray-900">
                <img 
                  /* 这里的 movies[0]! 就是修复报错的核心 */
                  src={movies[0]!._embedded?.['wp:featuredmedia']?.[0]?.source_url || '/placeholder-movie.jpg'} 
                  alt={movies[0]!.title.rendered} 
                  className="w-full h-[400px] md:h-[500px] object-cover opacity-80 group-hover:opacity-70 transition-opacity"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                <div className="absolute bottom-10 left-10 text-white z-10">
                  <span className="bg-purple-600 text-xs px-2 py-1 rounded-md mb-2 inline-block">🔥 最新 AI 热映</span>
                  <h2 className="text-3xl md:text-4xl font-bold">{movies[0]!.title.rendered}</h2>
                  <p className="text-gray-300 mt-2 line-clamp-1">一场跨越宇宙的宏大 AI 叙事...</p>
                  <button className="mt-4 bg-white text-black px-6 py-2 rounded-full font-semibold hover:bg-gray-200 transition">立即观看 →</button>
                </div>
              </div>
            )}

            {/* 2. 最新上架电影瀑布流网格 */}
            <div className="max-w-6xl mx-auto">
              <h3 className="text-2xl font-bold mb-6 border-l-4 border-purple-500 pl-3">🎬 最新上架 AI 短剧</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {movies.map((movie) => <MovieCard key={movie.id} movie={movie} />)}
              </div>
            </div>

            {/* 3. 向下无限拓展 -> 加载更多按钮 */}
            <div className="flex justify-center mt-16">
              {hasMore ? (
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="px-10 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '🌌 正在加载更多 AI 宇宙...' : '↓ 向下无限浏览 ↓'}
                </button>
              ) : (
                <p className="text-gray-400 text-sm">✨ 已经抵达 AI 影视的宇宙边缘，敬请等待新作诞生 ✨</p>
              )}
            </div>
          </>
        )}
      </section>

      {/* 保留原样：模态框与悬浮球 */}
      {activeModal === 'image' && <AIImageModal onClose={closeModal} />}
      {activeModal === 'translate' && <TranslateModal onClose={closeModal} />}
      {activeModal === 'video' && <VideoModal onClose={closeModal} />}
      <ClientOnly>
        <FloatingChat />
      </ClientOnly>
    </div>
  );
}