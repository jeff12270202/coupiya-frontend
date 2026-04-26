import { useMutation, useQuery } from '@apollo/client';
import { CREATE_CHECKOUT, ADD_TO_CHECKOUT, GET_CHECKOUT } from '@/graphql/cart';

export const useCart = () => {
  // 实现 checkoutId 的 localStorage 存储
  // 提供 addItem, removeItem, getCartItems 等方法
};