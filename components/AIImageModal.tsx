'use client';

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
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style, width: 512, height: 512 }),
      });

      if (response.ok) {
        const data = await response.json();
        setGeneratedImage(data.imageUrl || data.url);
      } else {
        // Mock generated image - use placeholder with prompt text
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
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-white text-xl">🎨</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">AI图像创作</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              描述你想要的画面
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：一个未来感十足的智能手表，在宇宙星空中漂浮，霓虹灯光，4k高清"
              rows={3}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              艺术风格
            </label>
            <div className="flex gap-2 flex-wrap">
              {styles.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    style === s.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
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
            className="w-full py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                生成中...
              </>
            ) : (
              '开始创作'
            )}
          </button>

          {generatedImage && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">生成结果：</p>
              <div className="relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 aspect-square">
                <Image
                  src={generatedImage}
                  alt="AI Generated"
                  fill
                  sizes="(max-width: 768px) 100vw, 512px"
                  className="object-cover"
                />
              </div>
              <button
                onClick={() => window.open(generatedImage, '_blank')}
                className="mt-2 text-sm text-purple-600 hover:text-purple-700"
              >
                查看大图 ↗
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}