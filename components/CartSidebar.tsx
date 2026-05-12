'use client';
import { useCart } from '@/lib/useCart2';
import { normalizeImageUrl } from '@/lib/utils';
import Image from 'next/image';

export default function CartSidebar({ onClose }: { onClose: () => void }) {
  // 移除 totalItems，只取需要的属性
  const { cart, loading, updateQuantity, removeLine } = useCart();

  if (loading) return <div>加载中...</div>;
  if (!cart || cart.lines.length === 0) return <div>购物车是空的</div>;

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-lg p-4 z-50 overflow-auto">
      <button onClick={onClose} className="float-right">✕</button>
      <h2 className="text-xl font-bold mb-4">购物车</h2>
      {cart.lines.map((item) => (
        <div key={item.id} className="flex gap-3 mb-4 border-b pb-2">
          <Image src={normalizeImageUrl(item.imageUrl)} width={50} height={50} alt={item.name} />
          <div className="flex-1">
            <p className="font-semibold">{item.name}</p>
            <p>{item.price} {item.currency}</p>
            <div className="flex items-center gap-2 mt-1">
              <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>-</button>
              <span>{item.quantity}</span>
              <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
              <button onClick={() => removeLine(item.id)} className="text-red-500 text-sm ml-2">删除</button>
            </div>
          </div>
        </div>
      ))}
      <div className="mt-4 text-right font-bold">总计：{cart.totalPrice} {cart.currency}</div>
      <button className="w-full mt-4 bg-rose-500 text-white py-2 rounded-full">去结账</button>
    </div>
  );
}