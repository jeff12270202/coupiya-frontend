"use client";

import { useState } from 'react';
import Image from 'next/image';
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function AIImageModal({ onClose }: { onClose: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [style, setStyle] = useState('cinematic');

  const styles = [
    { id: 'cinematic', name: '电影质感' },
    { id: 'anime', name: '二次元' },
    { id: 'realistic', name: '写实风格' },
    { id: 'artistic', name: '艺术插画' },
  ];

  const generateImage = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    try {
      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style, width: 512, height: 512 }),
      });

      if (response.ok) {
        const data = await response.json();
        setGeneratedImage(data.imageUrl || data.url);
      } else {
        setGeneratedImage(`https://placehold.co/512x512/8B5CF6/white?text=${encodeURIComponent(prompt.slice(0, 20))}`);
      }
    } catch (error) {
      console.error('Image generation error:', error);
      setGeneratedImage(`https://placehold.co/512x512/EF4444/white?text=生成失败`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-white text-xl">🎨</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">AI 图像创作</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">陶瓷纹样设计</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Input Area */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    描述你想要的画面
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="例如：一个精美的青花瓷纹样，传统中国风格，细腻的线条"
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-3 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    艺术风格
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {styles.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setStyle(s.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          style === s.id
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={generateImage}
                  disabled={isGenerating || !prompt.trim()}
                  className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium shadow-md hover:shadow-lg"
                >
                  {isGenerating ? (
                    <>
                      <ArrowPathIcon className="w-5 h-5 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <span>开始创作</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Result Display */}
            {generatedImage && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">生成结果</p>
                <div className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 aspect-square">
                  <Image
                    src={generatedImage}
                    alt="AI Generated"
                    fill
                    sizes="(max-width: 768px) 100vw, 512px"
                    className="object-cover"
                  />
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => window.open(generatedImage, '_blank')}
                    className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
                  >
                    查看大图 ↗
                  </button>
                  <button
                    onClick={generateImage}
                    disabled={isGenerating || !prompt.trim()}
                    className="flex-1 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    重新生成
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <select className="text-xs bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none">
                <option>Stable Diffusion</option>
                <option>DALL-E</option>
                <option>Midjourney</option>
              </select>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              💡 描述越详细，生成效果越好
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}