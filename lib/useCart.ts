import { useState, useEffect, useCallback } from 'react';

interface CartItem {
  id: string;
  variantId: string;
  quantity: number;
  name: string;
  price: number;
  currency: string;
  imageUrl?: string;
}

const CHECKOUT_TOKEN_KEY = 'saleorCheckoutToken';

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

export function useCart() {
  const [cart, setCart] = useState<{
    id: string;
    lines: CartItem[];
    totalPrice: number;
    currency: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const channel = process.env.NEXT_PUBLIC_SALEOR_CHANNEL || 'default-channel';

  const loadCart = useCallback(async (token: string) => {
    const query = `
      query GetCheckout($token: UUID!) {
        checkout(token: $token) {
          id
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
    try {
      const data = await saleorFetch<{ checkout: any }>(query, { token });
      if (data.checkout) {
        const lines = data.checkout.lines.map((line: any) => ({
          id: line.id,
          variantId: line.variant.id,
          quantity: line.quantity,
          name: line.variant.product.name,
          price: line.totalPrice.gross.amount,
          currency: line.totalPrice.gross.currency,
          imageUrl: line.variant.media?.[0]?.url,
        }));
        setCart({
          id: data.checkout.id,
          lines,
          totalPrice: data.checkout.totalPrice.gross.amount,
          currency: data.checkout.totalPrice.gross.currency,
        });
      } else {
        setCart(null);
      }
    } catch (err) {
      console.error('Failed to load cart', err);
      setCart(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(CHECKOUT_TOKEN_KEY);
    if (token) {
      loadCart(token);
    } else {
      setLoading(false);
    }
  }, [loadCart]);

  const addItem = async (variantId: string, quantity = 1) => {
    let token = localStorage.getItem(CHECKOUT_TOKEN_KEY);
    if (!token) {
      // 创建新 checkout
      const mutation = `
        mutation CreateCheckout($channel: String!, $variantId: ID!, $quantity: Int!) {
          checkoutCreate(
            input: { channel: $channel, lines: [{ variantId: $variantId, quantity: $quantity }] }
          ) {
            checkout { id token }
            errors { message }
          }
        }
      `;
      const data = await saleorFetch<{ checkoutCreate: any }>(mutation, {
        channel,
        variantId,
        quantity,
      });
      const checkout = data.checkoutCreate.checkout;
      if (!checkout) throw new Error(data.checkoutCreate.errors?.[0]?.message);
      token = checkout.token;
      localStorage.setItem(CHECKOUT_TOKEN_KEY, token);
      await loadCart(token);
    } else {
      // 已有 checkout，添加行
      const mutation = `
        mutation AddToCheckout($checkoutId: ID!, $variantId: ID!, $quantity: Int!) {
          checkoutLinesAdd(
            id: $checkoutId
            lines: [{ variantId: $variantId, quantity: $quantity }]
          ) {
            checkout { id token }
            errors { message }
          }
        }
      `;
      // 先加载 cart 确保有 id
      await loadCart(token);
      const checkoutIdFromCart = cart?.id;
      if (!checkoutIdFromCart) throw new Error('Checkout ID not found');
      await saleorFetch(mutation, {
        checkoutId: checkoutIdFromCart,
        variantId,
        quantity,
      });
      await loadCart(token);
    }
  };

  const updateQuantity = async (lineId: string, quantity: number) => {
    const token = localStorage.getItem(CHECKOUT_TOKEN_KEY);
    if (!token) return;
    const mutation = `
      mutation UpdateLine($checkoutId: ID!, $lineId: ID!, $quantity: Int!) {
        checkoutLinesUpdate(
          id: $checkoutId
          lines: [{ lineId: $lineId, quantity: $quantity }]
        ) {
          errors { message }
        }
      }
    `;
    const checkoutId = cart?.id;
    if (!checkoutId) return;
    await saleorFetch(mutation, { checkoutId, lineId, quantity });
    await loadCart(token);
  };

  const removeLine = async (lineId: string) => {
    const token = localStorage.getItem(CHECKOUT_TOKEN_KEY);
    if (!token) return;
    const mutation = `
      mutation RemoveLine($checkoutId: ID!, $lineId: ID!) {
        checkoutLineDelete(id: $checkoutId, lineId: $lineId) {
          errors { message }
        }
      }
    `;
    const checkoutId = cart?.id;
    if (!checkoutId) return;
    await saleorFetch(mutation, { checkoutId, lineId });
    await loadCart(token);
  };

  const clearCart = () => {
    localStorage.removeItem(CHECKOUT_TOKEN_KEY);
    setCart(null);
  };

  const totalItems = cart?.lines.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return { cart, loading, addItem, updateQuantity, removeLine, clearCart, totalItems };
}