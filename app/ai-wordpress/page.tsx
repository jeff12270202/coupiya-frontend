'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
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

export default function AIWordPressPage() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const closeModal = () => setActiveModal(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-amber-50">
      {/* Hero 区 */}
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

      {/* 服务卡片区 */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
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

      {/* 特色介绍 */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto bg-gradient-to-br from-purple-50 to-amber-50 rounded-2xl p-10 border border-purple-100">
          <h2 className="text-3xl font-serif font-bold text-center mb-8 text-gray-800">为什么选择我们的创作工坊？</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">🎨</span>
              </div>
              <h3 className="font-bold text-gray-800 mb-2">AI 创意赋能</h3>
              <p className="text-gray-600 text-sm">前沿 AI 技术，激发无限创作灵感</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">🚀</span>
              </div>
              <h3 className="font-bold text-gray-800 mb-2">WordPress 集成</h3>
              <p className="text-gray-600 text-sm">无缝对接，一键发布您的创作</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-rose-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">🎯</span>
              </div>
              <h3 className="font-bold text-gray-800 mb-2">专业工具</h3>
              <p className="text-gray-600 text-sm">为创作者量身打造的专业工具集</p>
            </div>
          </div>
        </div>
      </section>

      {/* 模态框 */}
      {activeModal === 'image' && <AIImageModal onClose={closeModal} />}
      {activeModal === 'translate' && <TranslateModal onClose={closeModal} />}
      {activeModal === 'video' && <VideoModal onClose={closeModal} />}

      {/* 浮动对话框 */}
      <ClientOnly>
        <FloatingChat />
      </ClientOnly>
    </div>
  );
}