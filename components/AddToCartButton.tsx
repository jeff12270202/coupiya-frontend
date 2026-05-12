'use client';
import { useCart } from '@/hooks/useCart';

export default function AddToCartButton({ variantId }: { variantId: string }) {
  const { addItem, loading } = useCart();
  return (
    <button
      onClick={() => addItem(variantId, 1)}
      disabled={loading}
      className="mt-4 bg-rose-500 text-white px-6 py-2 rounded-full hover:bg-rose-600"
    >
      加入购物车
    </button>
  );
}