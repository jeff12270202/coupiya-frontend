'use client';

import { useCart } from '@/hooks/useCart';
import { normalizeImageUrl } from '@/lib/utils';
import Image from 'next/image';
import { useMemo } from 'react';

export default function CartSidebar({ onClose }: { onClose: () => void }) {
  const { cart, loading, updateQuantity, removeLine } = useCart();

  // 1️⃣ 更好的加载状态（体验优化）
  if (loading) {
    return (
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-lg p-6 z-50 flex items-center justify-center">
        <div className="animate-pulse text-rose-500">🛒 加载购物车...</div>
      </div>
    );
  }

  // 2️⃣ 空的购物车 UI 美化（品牌感）
  if (!cart || cart.lines.length === 0) {
    return (
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-lg p-6 z-50 flex flex-col items-center justify-center">
        <h2 className="text-xl font-bold mb-2">🛒 购物车</h2>
        <p className="text-gray-500">购物车是空的</p>
        <button
          onClick={onClose}
          className="mt-6 bg-rose-500 text-white px-6 py-2 rounded-full hover:bg-rose-600 transition-colors"
        >
          去挑选好物
        </button>
      </div>
    );
  }

  // 3️⃣ 计算总价和总数量（使用 useMemo 提高性能）
  const totalPrice = useMemo(() => cart.totalPrice, [cart.totalPrice]);
  const currency = useMemo(() => cart.currency, [cart.currency]);

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-lg p-6 z-50 overflow-auto flex flex-col">
      {/* 头部：关闭按钮 */}
      <div className="flex justify-between items-center mb-6 pb-2 border-b">
        <h2 className="text-xl font-bold">🛒 购物车</h2>
        <button
          onClick={onClose}
          aria-label="关闭购物车侧边栏" // ✅ 无障碍必备
          className="w-8 h-8 rounded-full hover:bg-rose-50 flex items-center justify-center text-2xl leading-none"
        >
          ✕
        </button>
      </div>

      {/* 商品列表 */}
      <div className="flex-1 overflow-auto">
        {cart.lines.map((item) => (
          <div key={item.id} className="flex gap-4 mb-6 pb-4 border-b border-gray-100">
            <div className="relative w-16 h-16 shrink-0">
              <Image
                src={normalizeImageUrl(item.imageUrl)}
                alt={item.name}
                fill
                className="object-cover rounded-md"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{item.name}</p>
              <p className="text-sm text-gray-600 mt-0.5">
                {item.price} {currency}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  disabled={item.quantity <= 1} // ✅ 防止数量低于1
                  className="w-6 h-6 rounded border border-gray-300 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30"
                  aria-label="减少数量"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="w-6 h-6 rounded border border-gray-300 flex items-center justify-center hover:bg-gray-50"
                  aria-label="增加数量"
                >
                  +
                </button>
                <button
                  onClick={() => removeLine(item.id)}
                  className="ml-1 text-rose-500 text-xs hover:text-rose-700 transition-colors"
                  aria-label="删除商品"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 底部：结账 */}
      <div className="pt-4 border-t border-gray-200">
        <div className="flex justify-between font-bold text-lg mb-4">
          <span>总计</span>
          <span>{totalPrice} {currency}</span>
        </div>
        <button
          className="w-full bg-rose-600 text-white py-3 rounded-full hover:bg-rose-700 transition-colors font-semibold"
          aria-label="去结账"
        >
          去结账 →
        </button>
      </div>
    </div>
  );
}