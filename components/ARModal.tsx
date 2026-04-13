'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { XMarkIcon, CameraIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function ARModal({ onClose }: { onClose: () => void }) {
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const products = [
    { id: 'shirt', name: '时尚T恤', image: 'https://placehold.co/200x200/3B82F6/white?text=T-Shirt' },
    { id: 'sunglasses', name: '太阳镜', image: 'https://placehold.co/200x200/8B5CF6/white?text=Sunglasses' },
    { id: 'hat', name: '棒球帽', image: 'https://placehold.co/200x200/10B981/white?text=Hat' },
    { id: 'watch', name: '智能手表', image: 'https://placehold.co/200x200/EF4444/white?text=Watch' },
  ];

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
    // Simulate AR loading
    setTimeout(() => {
      setIsLoading(false);
      alert('AR体验已启动！\n\n在完整版本中，这将打开摄像头并使用增强现实技术将商品叠加到您的实时画面上。\n当前为演示模式，展示了AI虚拟试穿的核心概念。');
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center">
              <span className="text-white text-xl">🥽</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">AR虚拟试穿</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Product Selection */}
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">选择商品试穿</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => setSelectedProduct(product.id)}
                  className={`p-2 rounded-lg transition-all ${
                    selectedProduct === product.id
                      ? 'ring-2 ring-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="relative w-full h-24 rounded-md overflow-hidden">
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, 25vw"
                    />
                  </div>
                  <p className="text-xs mt-1 text-gray-600 dark:text-gray-400">{product.name}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Upload Photo */}
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">或上传您的照片</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-indigo-500 transition-colors flex items-center gap-2"
              >
                <CameraIcon className="w-5 h-5 text-gray-500" />
                上传照片
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              {previewImage && (
                <div className="flex items-center gap-2">
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden">
                    <Image
                      src={previewImage}
                      alt="Preview"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <button
                    onClick={() => setPreviewImage(null)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    清除
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* AR Preview */}
          {(selectedProduct || previewImage) && (
            <div className="bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">试穿效果预览</p>
              <div className="relative aspect-square bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
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
                    <div className="bg-black/50 text-white px-4 py-2 rounded-full text-sm">
                      {products.find(p => p.id === selectedProduct)?.name} 虚拟试穿中
                    </div>
                  </div>
                )}
                {isLoading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <ArrowPathIcon className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}
              </div>
              <button
                onClick={startARExperience}
                disabled={isLoading || !selectedProduct}
                className="w-full mt-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-colors disabled:opacity-50"
              >
                开始AR试穿
              </button>
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            AI增强现实技术，实时虚拟试穿，支持多角度查看
          </p>
        </div>
      </div>
    </div>
  );
}