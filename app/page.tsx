'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { ShoppingCartIcon } from '@heroicons/react/24/outline';
import CartSidebar from '@/components/CartSidebar';
import {
  ChatBubbleLeftRightIcon,
  SparklesIcon,
  LanguageIcon,
  MicrophoneIcon,
  CameraIcon,
} from '@heroicons/react/24/outline';
import RecommendSection from '@/components/RecommendSection';

const AIChatModal = dynamic(() => import('@/components/AIChatModal'), { ssr: false });
const AIImageModal = dynamic(() => import('@/components/AIImageModal'), { ssr: false });
const TranslateModal = dynamic(() => import('@/components/TranslateModal'), { ssr: false });
const VoiceModal = dynamic(() => import('@/components/VoiceModal'), { ssr: false });
const ARModal = dynamic(() => import('@/components/ARModal'), { ssr: false });
const ProductList = dynamic(() => import('@/components/ProductList'), {
  ssr: false,
  loading: () => <div className="text-center text-rose-400">✨ 正在为您甄选陶瓷美物 ✨</div>,
});

const AI_FEATURES = [
  {
    id: 'chat',
    title: 'AI 瓷语对话',
    description: '与购物小助手聊聊，获取专属陶瓷饰品推荐和搭配建议。',
    icon: ChatBubbleLeftRightIcon,
    color: 'from-rose-400 to-pink-500',
    modal: 'chat',
  },
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
    id: 'voice',
    title: '语音寻瓷',
    description: '说出你的需求，AI 为你找到心仪陶瓷。',
    icon: MicrophoneIcon,
    color: 'from-orange-400 to-red-400',
    modal: 'voice',
  },
  {
    id: 'ar',
    title: 'AR 试戴',
    description: '虚拟试戴陶瓷手链、耳环，所见即所得。',
    icon: CameraIcon,
    color: 'from-indigo-400 to-purple-500',
    modal: 'ar',
  },
];

export default function Home() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const closeModal = () => setActiveModal(null);
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Hero 区 — 陶瓷主题 */}
      <section className="relative bg-gradient-to-br from-rose-100 via-white to-amber-50 py-24 overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[url('/ceramic-pattern.svg')] bg-repeat"></div>
        <div className="container mx-auto px-4 text-center relative z-10">
          <div className="inline-block mb-4 px-4 py-1 bg-white/50 rounded-full backdrop-blur-sm text-rose-500 text-sm">
            ✨ 东方陶瓷 · AI 灵感 ✨
          </div>
          <h1 className="text-6xl font-serif font-bold text-gray-800 mb-4">瓷韵 · 灵境</h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">AI 赋能的陶瓷饰品商店，让每一件器物都承载你的独特故事</p>
          <button className="bg-rose-500 text-white px-8 py-3 rounded-full font-medium hover:bg-rose-600 transition shadow-lg">
            开始灵感之旅
          </button>
        </div>
      </section>
      <button onClick={() => setCartOpen(true)} className="fixed bottom-4 right-4 bg-rose-500 p-3 rounded-full text-white z-50">
        <ShoppingCartIcon className="w-6 h-6" />
      </button>
      {cartOpen && <CartSidebar onClose={() => setCartOpen(false)} />}

      {/* AI 功能卡片区 */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-4xl font-serif font-bold text-center mb-4 text-gray-800">AI 智趣工坊</h2>
        <p className="text-center text-gray-500 mb-12 max-w-2xl mx-auto">用 AI 创作你的陶瓷纹样，让购物充满想象力</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {AI_FEATURES.map((feature) => (
            <div
              key={feature.id}
              className="group bg-white rounded-2xl shadow-md cursor-pointer hover:shadow-2xl transition-all duration-300 hover:-translate-y-1"
              onClick={() => setActiveModal(feature.modal)}
            >
              <div className="p-8 text-center">
                <div className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-r ${feature.color} flex items-center justify-center mb-5 shadow-md`}>
                  <feature.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-gray-800">{feature.title}</h3>
                <p className="text-gray-500 mb-4">{feature.description}</p>
                <button className="text-sm font-medium text-rose-500 group-hover:text-rose-600">体验 →</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 商品列表 */}
      <section className="container mx-auto px-4 py-16 bg-white rounded-t-3xl shadow-inner">
        <h2 className="text-4xl font-serif font-bold text-center mb-3 text-gray-800">精选 · 东方手作</h2>
        <p className="text-center text-gray-500 mb-12">每一件陶瓷饰品，都是匠心与 AI 的灵感碰撞</p>
        <ProductList />
      </section>

      {/* AI 推荐区 */}
      <RecommendSection />

      {/* 模态框 */}
      {activeModal === 'chat' && <AIChatModal onClose={closeModal} />}
      {activeModal === 'image' && <AIImageModal onClose={closeModal} />}
      {activeModal === 'translate' && <TranslateModal onClose={closeModal} />}
      {activeModal === 'voice' && <VoiceModal onClose={closeModal} />}
      {activeModal === 'ar' && <ARModal onClose={closeModal} />}

      {/* 页脚 */}
      <footer className="bg-stone-800 text-stone-300 py-12 mt-16">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm">© 2025 瓷间 · 灵韵集 | 以 AI 重塑东方雅物</p>
        </div>
      </footer>
    </div>
  );
}