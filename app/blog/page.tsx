'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react'; // ✅ 删除了没用的 useRef
import NextDynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import {
  SparklesIcon,
  LanguageIcon,
  FilmIcon,
  PlayCircleIcon,
  XMarkIcon,
  ChevronUpIcon, // ✅ 保留并用于指示上下滑动
  ChevronDownIcon, // ✅ 保留并用于指示上下滑动
} from '@heroicons/react/24/outline';
import FloatingChat from '@/components/FloatingChat';
import ClientOnly from '@/components/ClientOnly';

// 动态导入模态框
const AIImageModal = NextDynamic(() => import('@/components/AIImageModal'), { ssr: false });
const VideoModal = NextDynamic(() => import('@/components/VideoModal'), { ssr: false });
const TranslateModal = NextDynamic(() => import('@/components/TranslateModal'), { ssr: false });

// --------------------------------------------------------
// 1. AI 卡片
// --------------------------------------------------------
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

// 电影和文章数据结构
interface MovieData {
  id: number;
  title: { rendered: string };
  link: string;
  _embedded?: {
    'wp:featuredmedia'?: Array<{ source_url: string }>;
  };
}

interface PostData {
  id: number;
  slug: string;
  title: { rendered: string };
  date: string;
  excerpt: { rendered: string };
  _embedded?: {
    'wp:featuredmedia'?: Array<{ source_url: string }>;
  };
}

// =====================================================
// 🎬【新增】无限滑动视频流组件 (仿微信视频号)
// =====================================================
function VideoFeedModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 使用 Pexels 免费 API 获取海量视频数据
  useEffect(() => {
    if (!isOpen) return;
    const fetchVideos = async () => {
      setLoading(true);
      try {
        const res = await fetch('https://api.pexels.com/videos/popular?per_page=15', {
          headers: {
            // 替换为您自己的 Pexels API Key (免费注册即可获取)
            Authorization: '2TbWGew1wNxt1k2vAIS5689Fxb7u6QM3prJbsIvgRSogx7dAD7WzgwC6' 
          }
        });
        const data = await res.json();
        setVideos(data.videos || []);
      } catch (err) {
        // 如果 API 报错，使用内置的演示测试视频流
        console.warn('Pexels API 失败，使用内置演示视频:', err);
        setVideos([
          { id: 1, video_files: [{ link: 'https://www.w3schools.com/html/mov_bbb.mp4', quality: 'hd' }] },
          { id: 2, video_files: [{ link: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', quality: 'hd' }] },
          { id: 3, video_files: [{ link: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', quality: 'hd' }] },
          { id: 4, video_files: [{ link: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', quality: 'hd' }] },
          { id: 5, video_files: [{ link: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', quality: 'hd' }] },
        ]);
      } finally {
        setLoading(false);
      }
    };
    fetchVideos();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
      {/* 顶部关闭按钮 */}
      <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
        <XMarkIcon className="w-8 h-8" />
      </button>

      {/* 滑动视频容器 */}
      <div className="w-full h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide bg-black">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-white text-xl">🌍 加载视频流中...</div>
        ) : (
          videos.map((video, idx) => {
            // 过滤出可以播放的 MP4/HLS 地址
            const videoUrl = video.video_files?.find((f: any) => f.quality === 'hd' || f.quality === 'sd')?.link || video.video_files?.[0]?.link;
            return (
              <div key={video.id || idx} className="w-full h-[100vh] snap-start relative flex items-center justify-center bg-gray-900">
                <video
                  src={videoUrl}
                  className="w-full h-full object-cover"
                  controls
                  loop
                  autoPlay
                  muted={idx !== 0} // 只有第一个视频有声音
                  playsInline
                />
                
                {/* ✅ 在这里实际渲染向上/向下滑动的提示箭头 */}
                <div className="absolute bottom-14 left-0 right-0 flex flex-row justify-center gap-6 items-center text-white/60 text-xs animate-pulse">
                  <ChevronUpIcon className="w-5 h-5" />
                  <span className="bg-black/30 px-3 py-1 rounded-full border border-white/20 font-medium tracking-wider">
                    滑动换视频
                  </span>
                  <ChevronDownIcon className="w-5 h-5" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// =====================================================
// 🎬【新增】浮动触发按钮 (右下角)
// =====================================================
function FloatingVideoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-24 right-6 z-40 p-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center gap-2"
    >
      <PlayCircleIcon className="w-8 h-8" />
      <span className="text-xs font-bold pr-1 hidden sm:block">刷短视频</span>
    </button>
  );
}


export default function BlogPage() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [isVideoFeedOpen, setIsVideoFeedOpen] = useState(false);
  const closeModal = () => setActiveModal(null);

  const [movies, setMovies] = useState<MovieData[]>([]);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [moviePage, setMoviePage] = useState(1);
  const [hasMoreMovies, setHasMoreMovies] = useState(true);
  const [initialMoviesLoading, setInitialMoviesLoading] = useState(true);

  const [posts, setPosts] = useState<PostData[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const fetchMovies = useCallback(async (pageNum: number, append = false) => {
    if (loadingMovies) return;
    setLoadingMovies(true);
    try {
      const res = await fetch(`https://blog.coupiya.com/wp-json/wp/v2/movie?page=${pageNum}&per_page=12&_embed`);
      if (!res.ok) throw new Error('Failed to fetch movies');
      const data = await res.json();
      if (data.length === 0) {
        setHasMoreMovies(false);
      } else {
        setMovies((prev) => (append ? [...prev, ...data] : data));
      }
    } catch (error) {
      console.error('🎬 拉取全球 AI 影视数据失败:', error);
    } finally {
      setLoadingMovies(false);
      setInitialMoviesLoading(false);
    }
  }, [loadingMovies]);

  const fetchPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const res = await fetch(`https://blog.coupiya.com/wp-json/wp/v2/posts?per_page=5&_embed`);
      if (!res.ok) throw new Error('Failed to fetch posts');
      const data = await res.json();
      setPosts(data);
    } catch (error) {
      console.error('📝 拉取灵感日志失败:', error);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    fetchMovies(1, false);
    fetchPosts();
  }, [fetchMovies, fetchPosts]);

  const handleLoadMoreMovies = () => {
    if (hasMoreMovies && !loadingMovies) {
      const nextPage = moviePage + 1;
      setMoviePage(nextPage);
      fetchMovies(nextPage, true);
    }
  };

  // ======================== 电影卡片组件 ========================
  const MovieCard = ({ movie }: { movie: MovieData }) => (
    <Link href={movie.link} target="_blank" className="group relative bg-white rounded-xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
      <div className="relative aspect-[2/3] overflow-hidden bg-gray-200">
        <Image
          src={movie._embedded?.['wp:featuredmedia']?.[0]?.source_url || 'https://placehold.co/300x450/222/fff?text=AI+Movie'}
          alt={movie.title.rendered}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105 group-hover:brightness-75"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-black shadow-lg">
            ▶
          </div>
        </div>
      </div>
      <div className="p-3">
        <h4 className="font-bold text-gray-800 text-sm truncate">{movie.title.rendered}</h4>
        <div className="flex justify-between items-center mt-2 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">⭐ 9.0 <span className="text-gray-400 text-[8px]">AI</span></span>
          <span>12 分钟</span>
        </div>
      </div>
    </Link>
  );

  // ======================== 灵感日志卡片组件 ========================
  const PostCard = ({ post }: { post: PostData }) => (
    <Link href={`/blog/${post.slug}`} className="block group">
      <div className="flex flex-col md:flex-row gap-4 py-6 border-b border-gray-100 hover:bg-gray-50 transition-colors p-4 rounded-xl">
        {post._embedded?.['wp:featuredmedia']?.[0]?.source_url && (
          <div className="relative w-full md:w-48 h-32 flex-shrink-0 rounded-lg overflow-hidden">
            <Image
              src={post._embedded['wp:featuredmedia'][0].source_url}
              alt={post.title.rendered}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        )}
        <div className="flex-1 flex flex-col justify-center">
          <h3 className="text-xl font-semibold text-gray-800 group-hover:text-purple-600 transition-colors">
            {post.title.rendered}
          </h3>
          <div 
            className="text-sm text-gray-500 line-clamp-2 mt-1"
            dangerouslySetInnerHTML={{ __html: post.excerpt.rendered }} 
          />
          <div className="text-xs text-gray-400 mt-2">
            {new Date(post.date).toLocaleDateString('zh-CN')}
          </div>
        </div>
      </div>
    </Link>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-amber-50 pb-20">
      
      {/* 区域1：主标题与 UGC 极客创作入口 */}
      <section className="relative py-24 overflow-hidden text-center">
        <div className="container mx-auto px-4 text-center relative z-10">
          <div className="inline-block mb-4 px-4 py-1 bg-white/50 rounded-full backdrop-blur-sm text-purple-600 text-sm font-semibold">
            🌍 全球顶级创作生态
          </div>
          <h1 className="text-5xl font-serif font-bold text-gray-800 mb-4 tracking-wide">
            全球AI 流媒影视共享
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            上传你的灵感、创作你的影视。极客空间提供 5GB 专属云盘，创作即全球发布。
          </p>
          
          <div className="flex flex-col items-center mt-6 mb-10">
            <a 
              href="https://cloudstudio.net/a/37226742083846144?channel=share&sharetype=URL"
              target="_blank" 
              rel="noopener noreferrer"
              className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xl rounded-full shadow-2xl hover:scale-105 transition-transform flex items-center gap-3"
            >
              <span className="text-2xl">🚀</span> 极速 AI 极客创作空间 (Cloud Studio)
            </a>
            <p className="text-gray-500 text-sm mt-3 text-center">内置 5GB 专属云盘 · 创作即全球发布</p>
          </div>
        </div>
      </section>

      {/* 区域2：AI 创作三大功能卡片 */}
      <section className="container mx-auto px-4 py-8">
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

      {/* 区域3：全球顶级 AI 影视流媒区 */}
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

        {initialMoviesLoading ? (
          <div className="text-center py-20 text-gray-400 text-xl">🌍 正在召唤全球 AI 影视巨作...</div>
        ) : movies.length === 0 ? (
          <div className="text-center py-20 text-gray-400">暂无 AI 影视作品，请等候后台自动生成。</div>
        ) : (
          <>
            {movies.length > 0 && (
              <div className="max-w-6xl mx-auto mb-16 relative group rounded-2xl overflow-hidden shadow-2xl bg-gray-900">
                <Image 
                  src={movies[0]!._embedded?.['wp:featuredmedia']?.[0]?.source_url || '/placeholder-movie.jpg'} 
                  alt={movies[0]!.title.rendered} 
                  fill
                  className="object-cover opacity-80 group-hover:opacity-70 transition-opacity"
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

            <div className="max-w-6xl mx-auto">
              <h3 className="text-2xl font-bold mb-6 border-l-4 border-purple-500 pl-3">🎬 最新上架 AI 短剧</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {movies.map((movie) => <MovieCard key={movie.id} movie={movie} />)}
              </div>
            </div>

            <div className="flex justify-center mt-16">
              {hasMoreMovies ? (
                <button
                  onClick={handleLoadMoreMovies}
                  disabled={loadingMovies}
                  className="px-10 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMovies ? '🌌 正在加载更多 AI 宇宙...' : '↓ 向下无限浏览 ↓'}
                </button>
              ) : (
                <p className="text-gray-400 text-sm">✨ 已经抵达 AI 影视的宇宙边缘，敬请等待新作诞生 ✨</p>
              )}
            </div>
          </>
        )}
      </section>

      {/* 区域4：真实的“灵感日志”文章列表 */}
      <section className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex justify-between items-end mb-8 border-b-2 border-purple-200 pb-4">
          <h2 className="text-3xl font-serif font-bold text-gray-800 flex items-center gap-2">
            <span className="text-3xl">📝</span> 灵感日志
          </h2>
          <Link href="/blog" className="text-purple-600 text-sm hover:underline">查看全部 →</Link>
        </div>

        {loadingPosts ? (
          <div className="text-center py-10 text-gray-400">加载灵感日志中...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-10 text-gray-400">还没有灵感日志，快去 AI 卡片生成吧！</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </section>

      {/* 统一模态框与浮动助手 */}
      {activeModal === 'image' && <AIImageModal onClose={closeModal} />}
      {activeModal === 'translate' && <TranslateModal onClose={closeModal} />}
      {activeModal === 'video' && <VideoModal onClose={closeModal} />}
      
      <ClientOnly>
        <FloatingChat />
        {/* 新增的无限视频流浮窗 */}
        <FloatingVideoButton onClick={() => setIsVideoFeedOpen(true)} />
        <VideoFeedModal isOpen={isVideoFeedOpen} onClose={() => setIsVideoFeedOpen(false)} />
      </ClientOnly>
    </div>
  );
}