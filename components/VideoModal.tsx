"use client";

import { useState } from 'react';
import { XMarkIcon, PlayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function VideoModal({ onClose }: { onClose: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const generateVideo = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setErrorMsg('');
    setVideoUrl(null);

    try {
      const response = await fetch('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();
      if (data.videoUrl) {
        setVideoUrl(data.videoUrl);
      }
      if (!data.success && data.message) {
        setErrorMsg(data.message);
      }
    } catch {
      setErrorMsg('视频生成失败，请稍后重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      generateVideo();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
              <span className="text-white text-xl">🎬</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">AI 视频生成</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">输入描述，生成短视频</p>
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
                    描述你想要的视频画面
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="例如：一个旋转的青花瓷花瓶，光影流转，展示其精美的纹饰"
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-3 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  onClick={generateVideo}
                  disabled={isGenerating || !prompt.trim()}
                  className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium shadow-md hover:shadow-lg"
                >
                  {isGenerating ? (
                    <>
                      <ArrowPathIcon className="w-5 h-5 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <PlayIcon className="w-5 h-5" />
                      生成视频
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Result Display */}
            {videoUrl && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">生成结果</p>
                <div className="relative rounded-xl overflow-hidden bg-black">
                  <video
                    src={videoUrl}
                    controls
                    className="w-full max-h-[400px]"
                    playsInline
                  />
                </div>
              </div>
            )}

            {errorMsg && !videoUrl && (
              <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-amber-700 dark:text-amber-300 text-sm">
                ⚠️ {errorMsg}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              🎬 视频生成需要约 30-60 秒，请耐心等待
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}