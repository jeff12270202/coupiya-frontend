"use client";

import { useState } from "react";
import { SparklesIcon, CameraIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import NextDynamic from "next/dynamic";
import FloatingChat from "@/components/FloatingChat";
import ClientOnly from "@/components/ClientOnly";

// 动态导入真实的模态框组件，防止首屏加载过重
const AIChatModal = NextDynamic(() => import("@/components/AIChatModal"), { ssr: false });
const AIImageModal = NextDynamic(() => import("@/components/AIImageModal"), { ssr: false });
const VideoModal = NextDynamic(() => import("@/components/VideoModal"), { ssr: false });

export default function AIWordpressPage() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const closeModal = () => setActiveModal(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
      {/* Hero 区 — 纯 AI 主题 */}
      <section className="relative py-20 overflow-hidden">
        <div className="container mx-auto px-4 text-center relative z-10">
          <div className="inline-block mb-4 px-4 py-1 bg-white/50 rounded-full backdrop-blur-sm text-purple-600 text-sm font-medium shadow-sm">
            ✨ AI 驱动 · 全球顶级创作工坊 ✨
          </div>
          <h1 className="text-5xl font-serif font-bold text-gray-800 mb-4">AI-WORDPRESS 创作工坊</h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            为全球创作者提供顶尖的 AI 图片、视频、动漫生成服务，一键搭建属于你的影视生态系统。
          </p>
        </div>
      </section>

      {/* 核心卡片区域 —— 三大顶级功能 */}
      <section className="container mx-auto px-4 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
         
          {/* 卡片1：AI 图片生成 */}
          <div
            onClick={() => setActiveModal("image")}
            className="group bg-white rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 p-10 text-center cursor-pointer border border-purple-100"
          >
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-5 shadow-lg text-white">
              <SparklesIcon className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold mb-3 text-gray-800">AI 图片创生</h3>
            <p className="text-gray-500 leading-relaxed mb-6">输入灵感，一键生成全球独一无二的高清创意图片，引爆你的视觉世界。</p>
            <span className="inline-block text-purple-600 font-semibold text-sm group-hover:translate-x-1 transition-transform">立即体验 →</span>
          </div>

          {/* 卡片2：AI 视频生成 */}
          <div
            onClick={() => setActiveModal("video")}
            className="group bg-white rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 p-10 text-center cursor-pointer border border-blue-100"
          >
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-5 shadow-lg text-white">
              <CameraIcon className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold mb-3 text-gray-800">AI 视频生成</h3>
            <p className="text-gray-500 leading-relaxed mb-6">让静态图像动起来！制作电影级预告片、动漫片段或短视频，创造影视大片。</p>
            <span className="inline-block text-blue-600 font-semibold text-sm group-hover:translate-x-1 transition-transform">立即体验 →</span>
          </div>

          {/* 卡片3：AI 动漫工坊 */}
          <div
            onClick={() => setActiveModal("anime")}
            className="group bg-white rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 p-10 text-center cursor-pointer border border-orange-100"
          >
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center mb-5 shadow-lg text-white">
              <ChatBubbleLeftRightIcon className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold mb-3 text-gray-800">AI 动漫工坊</h3>
            <p className="text-gray-500 leading-relaxed mb-6">生成精美的二次元作品，自动转换为动漫绘画与番剧风格，支持多集连续产出。</p>
            <span className="inline-block text-orange-600 font-semibold text-sm group-hover:translate-x-1 transition-transform">立即体验 →</span>
          </div>

        </div>
      </section>

      {/* 页脚 */}
      <footer className="border-t border-gray-200 py-10 text-center text-gray-400 text-sm bg-white/50 backdrop-blur-sm">
        <p>© 2025 AI-WORDPRESS 创作工坊 · 用 AI 重塑全球影视与创作生态</p>
      </footer>

      {/* 浮动助手及真实的模态框调用 */}
      <ClientOnly>
        <FloatingChat />
      </ClientOnly>
     
      {/* 🔥 核心修复：将占位 div 替换为真实的模态框组件！ */}
      {activeModal === "image" && <AIImageModal onClose={closeModal} />}
      {activeModal === "video" && <VideoModal onClose={closeModal} />}
      {/* 由于您说动漫也是独立的工坊，如果还没有独立的动漫模态框，这里暂时沿用 AIChatModal，并在里面用代码判断触发 AI */}
      {activeModal === "anime" && <AIChatModal onClose={closeModal} />}
    </div>
  );
}