import { useState, useEffect, useCallback } from 'react';

// ---------- 类型定义 ----------
interface CartLine {
  id: string;          // 对应 Saleor 的 CheckoutLine.id
  variantId: string;   // 商品变体 ID
  quantity: number;
  name: string;
  price: number;
  currency: string;
  imageUrl?: string;
}

interface Checkout {
  id: string;
  token: string;
  lines: CartLine[];
  totalPrice: number;
  currency: string;
}

// ---------- 工具函数：访问 localStorage ----------
const getStoredCheckoutToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('checkoutToken');
};
const setStoredCheckoutToken = (token: string) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('checkoutToken', token);
};
const removeStoredCheckoutToken = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('checkoutToken');
};

// GraphQL 请求封装
const saleorFetch = async <T = any>(query: string, variables?: any): Promise<T> => {
  const res = await fetch('/api/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
};

// ---------- Saleor 相关 GraphQL 片段 ----------
const CREATE_CHECKOUT_MUTATION = `
  mutation CreateCheckout($channel: String!, $variantId: ID!, $quantity: Int!) {
    checkoutCreate(
      input: {
        channel: $channel
        lines: [{ variantId: $variantId, quantity: $quantity }]
      }
    ) {
      checkout {
        id
        token
        lines {
          id
          variant {
            id
            name
            product { name }
          }
          quantity
          totalPrice { gross { amount currency } }
        }
        totalPrice { gross { amount currency } }
      }
      errors { field message }
    }
  }
`;

const ADD_TO_CHECKOUT_MUTATION = `
  mutation AddToCheckout($checkoutId: ID!, $variantId: ID!, $quantity: Int!) {
    checkoutLinesAdd(
      id: $checkoutId
      lines: [{ variantId: $variantId, quantity: $quantity }]
    ) {
      checkout {
        id
        token
        lines {
          id
          variant { id name product { name } }
          quantity
          totalPrice { gross { amount currency } }
        }
        totalPrice { gross { amount currency } }
      }
      errors { field message }
    }
  }
`;

const REMOVE_LINE_MUTATION = `
  mutation RemoveCheckoutLine($checkoutId: ID!, $lineId: ID!) {
    checkoutLineDelete(id: $checkoutId, lineId: $lineId) {
      checkout {
        id
        lines { id variant { id name } quantity totalPrice { gross { amount } } }
        totalPrice { gross { amount } }
      }
      errors { field message }
    }
  }
`;

const UPDATE_LINE_MUTATION = `
  mutation UpdateCheckoutLine($checkoutId: ID!, $lineId: ID!, $quantity: Int!) {
    checkoutLinesUpdate(
      id: $checkoutId
      lines: [{ lineId: $lineId, quantity: $quantity }]
    ) {
      checkout {
        id
        lines { id variant { id } quantity totalPrice { gross { amount } } }
        totalPrice { gross { amount } }
      }
      errors { field message }
    }
  }
`;

const GET_CHECKOUT_QUERY = `
  query GetCheckout($token: UUID!) {
    checkout(token: $token) {
      id
      token
      lines {
        id
        variant {
          id
          name
          product { name }
          media { url }
        }
        quantity
        totalPrice { gross { amount currency } }
      }
      totalPrice { gross { amount currency } }
    }
  }
`;

// ---------- React Hook ----------
export function useCart() {
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const channel = process.env.NEXT_PUBLIC_SALEOR_CHANNEL || 'Channel-USD';

  // 从 token 加载完整的 checkout 数据
  const loadCheckoutFromToken = useCallback(async (token: string) => {
    try {
      const data = await saleorFetch<{ checkout: any }>(GET_CHECKOUT_QUERY, { token });
      if (data.checkout) {
        const lines: CartLine[] = data.checkout.lines.map((line: any) => ({
          id: line.id,
          variantId: line.variant.id,
          quantity: line.quantity,
          name: line.variant.product.name,
          price: line.totalPrice.gross.amount,
          currency: line.totalPrice.gross.currency,
          imageUrl: line.variant.media?.[0]?.url,
        }));
        setCheckout({
          id: data.checkout.id,
          token: data.checkout.token,
          lines,
          totalPrice: data.checkout.totalPrice.gross.amount,
          currency: data.checkout.totalPrice.gross.currency,
        });
      } else {
        // token 无效，清除本地存储
        removeStoredCheckoutToken();
        setCheckout(null);
      }
    } catch (err: any) {
      console.error('loadCheckout failed', err);
      setError(err.message);
    }
  }, []);

  // 初始化：读取 token 并加载购物车
  useEffect(() => {
    const token = getStoredCheckoutToken();
    if (token) {
      loadCheckoutFromToken(token).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [loadCheckoutFromToken]);

  // 添加商品（核心方法）
  const addItem = async (variantId: string, quantity = 1) => {
    setError(null);
    try {
      if (!checkout) {
        // 首次添加，创建新 checkout
        const data = await saleorFetch<{ checkoutCreate: any }>(CREATE_CHECKOUT_MUTATION, {
          channel,
          variantId,
          quantity,
        });
        const newCheckout = data.checkoutCreate.checkout;
        if (!newCheckout) throw new Error(data.checkoutCreate.errors?.[0]?.message || '创建购物车失败');
        setStoredCheckoutToken(newCheckout.token);
        // 重新加载完整数据
        await loadCheckoutFromToken(newCheckout.token);
      } else {
        // 已有购物车，增加行
        const data = await saleorFetch<{ checkoutLinesAdd: any }>(ADD_TO_CHECKOUT_MUTATION, {
          checkoutId: checkout.id,
          variantId,
          quantity,
        });
        const updatedCheckout = data.checkoutLinesAdd.checkout;
        if (!updatedCheckout) throw new Error(data.checkoutLinesAdd.errors?.[0]?.message);
        // 更新 state（简化：重新加载）
        await loadCheckoutFromToken(checkout.token);
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  // 移除行
  const removeItem = async (lineId: string) => {
    if (!checkout) return;
    try {
      await saleorFetch(REMOVE_LINE_MUTATION, { checkoutId: checkout.id, lineId });
      await loadCheckoutFromToken(checkout.token);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // 更新数量
  const updateQuantity = async (lineId: string, quantity: number) => {
    if (!checkout || quantity < 1) return;
    try {
      await saleorFetch(UPDATE_LINE_MUTATION, { checkoutId: checkout.id, lineId, quantity });
      await loadCheckoutFromToken(checkout.token);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // 清空购物车（删除 checkout 并清除 token）
  const clearCart = async () => {
    if (!checkout) return;
    // 注意：Saleor 没有直接删除 checkout 的 mutation，可以移除所有行实现清空
    for (const line of checkout.lines) {
      await removeItem(line.id);
    }
    removeStoredCheckoutToken();
    setCheckout(null);
  };

  // 获取购物车中商品总数量
  const totalItems = checkout?.lines.reduce((sum, line) => sum + line.quantity, 0) || 0;

  return {
    cart: checkout,
    loading,
    error,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    totalItems,
    totalPrice: checkout?.totalPrice || 0,
    currency: checkout?.currency || 'CNY',
  };
}