"use client";

import { useState, useRef } from 'react';
import Image from 'next/image';
import { XMarkIcon, CameraIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

const products = [
  { id: '1', name: '青花瓷手链', image: 'https://placehold.co/200x200/f472b6/ffffff?text=Bracelet' },
  { id: '2', name: '陶瓷耳环', image: 'https://placehold.co/200x200/8b5cf6/ffffff?text=Earrings' },
  { id: '3', name: '玉质吊坠', image: 'https://placehold.co/200x200/10b981/ffffff?text=Pendant' },
  { id: '4', name: '陶瓷项链', image: 'https://placehold.co/200x200/ef4444/ffffff?text=Necklace' },
];

export default function ARModal({ onClose }: { onClose: () => void }) {
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPreviewImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const startARExperience = async () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      alert('AR 体验已启动！\n\n在完整版本中，这将打开摄像头并使用增强现实技术将商品叠加到您的实时画面上。\n当前为演示模式，展示了 AI 虚拟试穿的核心概念。');
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center">
              <span className="text-white text-xl">🥽</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">AR 试戴</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">虚拟试穿 · 所见即所得</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Product Selection */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">选择商品试穿</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {products.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => setSelectedProduct(product.id)}
                    className={`p-3 rounded-xl transition-all border-2 ${
                      selectedProduct === product.id
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 ring-2 ring-indigo-500/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 mb-2">
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-300 font-medium truncate">{product.name}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Photo Upload */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">或上传您的照片</p>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:border-indigo-400 dark:hover:border-indigo-600 transition-all flex flex-col items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <CameraIcon className="w-8 h-8 text-gray-400" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">点击上传照片</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                
                {previewImage && (
                  <div className="flex items-center gap-3">
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                      <Image
                        src={previewImage}
                        alt="Preview"
                        fill
                        className="object-cover"
                      />
                    </div>
                    <button
                      onClick={() => setPreviewImage(null)}
                      className="text-xs text-red-500 hover:text-red-600 transition-colors"
                    >
                      清除
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* AR Preview */}
            {(selectedProduct || previewImage) && (
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-6 border border-indigo-200 dark:border-indigo-800">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">试穿效果预览</p>
                <div className="relative aspect-square bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden">
                  {previewImage ? (
                    <Image
                      src={previewImage}
                      alt="User"
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <CameraIcon className="w-16 h-16 text-gray-400" />
                    </div>
                  )}
                  {selectedProduct && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-black/60 text-white px-6 py-3 rounded-full text-sm font-medium backdrop-blur-sm">
                        {products.find(p => p.id === selectedProduct)?.name} 虚拟试穿中
                      </div>
                    </div>
                  )}
                  {isLoading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <ArrowPathIcon className="w-10 h-10 text-white animate-spin" />
                        <span className="text-white font-medium">启动 AR 中...</span>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={startARExperience}
                  disabled={isLoading || !selectedProduct}
                  className="w-full mt-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-md hover:shadow-lg"
                >
                  {isLoading ? '启动中...' : '开始 AR 试穿'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <select className="text-xs bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none">
                <option>ARKit</option>
                <option>ARCore</option>
                <option>WebXR</option>
              </select>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ✨ AI 增强现实技术，实时虚拟试穿
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}