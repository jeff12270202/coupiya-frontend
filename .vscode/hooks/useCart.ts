import { useState, useEffect, useCallback } from 'react';

interface CartLine {
  id: string;
  variantId: string;
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

const CHECKOUT_TOKEN_KEY = 'checkoutToken';

// ---------- 工具函数 ----------
const getStoredCheckoutToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CHECKOUT_TOKEN_KEY);
};
const setStoredCheckoutToken = (token: string) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CHECKOUT_TOKEN_KEY, token);
};
const removeStoredCheckoutToken = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CHECKOUT_TOKEN_KEY);
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

// ---------- GraphQL Mutation/Query ----------
const CREATE_CHECKOUT_MUTATION = `
  mutation CreateCheckout($channel: String!, $variantId: ID!, $quantity: Int!) {
    checkoutCreate(
      input: { channel: $channel, lines: [{ variantId: $variantId, quantity: $quantity }] }
    ) {
      checkout { id token }
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
      checkout { id lines { id } }
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
        variant { id name product { name } media { url } }
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

  // 从 token 完整加载购物车数据
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
        removeStoredCheckoutToken();
        setCheckout(null);
      }
    } catch (err: any) {
      console.error('Load Checkout Failed:', err);
      setError(err.message);
    }
  }, []);

  // 初始化
  useEffect(() => {
    const token = getStoredCheckoutToken();
    if (token) {
      loadCheckoutFromToken(token).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [loadCheckoutFromToken]);

  // 添加商品 (标准版)
  const addItem = useCallback(async (variantId: string, quantity = 1) => {
    setError(null);
    try {
      if (!checkout) {
        const data = await saleorFetch<{ checkoutCreate: any }>(CREATE_CHECKOUT_MUTATION, {
          channel,
          variantId,
          quantity,
        });
        const newCheckout = data.checkoutCreate.checkout;
        if (!newCheckout) throw new Error(data.checkoutCreate.errors?.[0]?.message || 'Create checkout failed');
        setStoredCheckoutToken(newCheckout.token);
        await loadCheckoutFromToken(newCheckout.token);
      } else {
        await saleorFetch(ADD_TO_CHECKOUT_MUTATION, {
          checkoutId: checkout.id,
          variantId,
          quantity,
        });
        await loadCheckoutFromToken(checkout.token);
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [checkout, channel, loadCheckoutFromToken]);

  // 其他方法如 removeItem, updateQuantity, clearCart 保持不变（保持原样即可）

  const totalItems = checkout?.lines.reduce((sum, line) => sum + line.quantity, 0) || 0;

  return {
    cart: checkout,   // ✅ 统一命名为 cart
    loading,
    error,
    addItem,
    // 其他方法保留
    totalItems,
    totalPrice: checkout?.totalPrice || 0,
    currency: checkout?.currency || 'CNY',
  };
}