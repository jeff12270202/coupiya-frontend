'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import {
  ChatBubbleLeftRightIcon,
  SparklesIcon,
  LanguageIcon,
  MicrophoneIcon,
  CameraIcon,
} from '@heroicons/react/24/outline';
import AIChatModal from '@/components/AIChatModal';
import AIImageModal from '@/components/AIImageModal';
import TranslateModal from '@/components/TranslateModal';
import VoiceModal from '@/components/VoiceModal';
import ARModal from '@/components/ARModal';
import RecommendSection from '@/components/RecommendSection';

const AIChatModal = dynamic(() => import('@/components/AIChatModal'), { ssr: true });
const AIImageModal = dynamic(() => import('@/components/AIImageModal'), { ssr: true });
const TranslateModal = dynamic(() => import('@/components/TranslateModal'), { ssr: true });
const VoiceModal = dynamic(() => import('@/components/VoiceModal'), { ssr: true });
const ARModal = dynamic(() => import('@/components/ARModal'), { ssr: true });
const ProductList = dynamic(() => import('@/components/ProductList'), {
  ssr: true,
  loading: () => <div className="text-center text-gray-500">加载商品中...</div>,
});

const AI_FEATURES = [
  {
    id: 'chat',
    title: 'AI智能对话',
    description: '与AI购物助手实时对话，获取个性化产品推荐和购物建议。',
    icon: ChatBubbleLeftRightIcon,
    color: 'from-blue-500 to-cyan-500',
    modal: 'chat',
  },
  {
    id: 'image',
    title: 'AI图像生成',
    description: '使用AI生成商品概念图、广告素材和个性化设计。',
    icon: SparklesIcon,
    color: 'from-purple-500 to-pink-500',
    modal: 'image',
  },
  {
    id: 'translate',
    title: '实时翻译',
    description: '支持100+语言实时翻译，打破全球购物语言障碍。',
    icon: LanguageIcon,
    color: 'from-green-500 to-emerald-500',
    modal: 'translate',
  },
  {
    id: 'voice',
    title: '语音购物',
    description: '通过语音指令搜索商品、查询订单和获取购物帮助。',
    icon: MicrophoneIcon,
    color: 'from-orange-500 to-red-500',
    modal: 'voice',
  },
  {
    id: 'ar',
    title: 'AR虚拟试穿',
    description: '增强现实技术实现虚拟试衣、试妆和产品预览。',
    icon: CameraIcon,
    color: 'from-indigo-500 to-purple-500',
    modal: 'ar',
  },
];

export default function Home() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const closeModal = () => setActiveModal(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold mb-4">AI 智慧商城</h1>
          <p className="text-xl mb-8">下一代购物体验，由人工智能驱动</p>
          <button className="bg-white text-indigo-600 px-8 py-3 rounded-full font-semibold hover:bg-gray-100 transition">
            探索 AI 功能
          </button>
        </div>
      </section>

      {/* AI Features Grid */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12 text-gray-800 dark:text-white">AI 智能核心</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {AI_FEATURES.map((feature) => (
            <div
              key={feature.id}
              className="group relative bg-white dark:bg-gray-800 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-shadow"
              onClick={() => setActiveModal(feature.modal)}
            >
              <div className="p-6">
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-r ${feature.color} flex items-center justify-center mb-4`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-white">{feature.title}</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">{feature.description}</p>
                <button className="text-sm font-medium text-indigo-600 dark:text-indigo-400">立即体验 →</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 商品列表部分 - 使用动态组件避免 SSR 问题 */}
      <section className="container mx-auto px-4 py-16 bg-white dark:bg-gray-900 rounded-t-3xl">
        <h2 className="text-3xl font-bold text-center mb-12 text-gray-800 dark:text-white">精选商品</h2>
        <ProductList />
      </section>

      <RecommendSection />

      {/* Modals */}
      {activeModal === 'chat' && <AIChatModal onClose={closeModal} />}
      {activeModal === 'image' && <AIImageModal onClose={closeModal} />}
      {activeModal === 'translate' && <TranslateModal onClose={closeModal} />}
      {activeModal === 'voice' && <VoiceModal onClose={closeModal} />}
      {activeModal === 'ar' && <ARModal onClose={closeModal} />}

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8 mt-16">
        <div className="container mx-auto px-4 text-center">
          <p>&copy; 2025 AI 智慧商城 - 由人工智能驱动的购物体验</p>
        </div>
      </footer>
    </div>
  );
}