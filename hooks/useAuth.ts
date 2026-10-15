'use client';

/**
 * useAuth —— 网站全局登录态 Hook
 * 原则（用户澄清版）：
 *   - 全站浏览完全开放，不做页面级拦截；
 *   - 仅「AI 视频生成」与「极速AI极客创作空间」两个创作入口需要刷脸登录 + 余额。
 * 依赖后端路由：
 *   GET  /api/auth/me           -> 200: { user } | 401: 未登录
 *   POST /api/auth/logout       -> 注销
 */
import { useCallback, useEffect, useState } from 'react';

export interface AuthUser {
  id: number;
  nickname: string;
  /** 密码登录账号（刷脸注册后设置） */
  username?: string;
  avatar?: string;
  balance: number;
  isFrozen?: boolean;
  /** true = 刷脸已注册但尚未设置强密码（必须先补设才能用密码登录） */
  needsPassword?: boolean;
}

export interface UseAuthResult {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.status === 401) {
        setUser(null);
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setUser(data?.user ?? null);
    } catch (err) {
      // 网络异常时保持现状，不误判为登出
      console.error('[useAuth] 获取登录态失败:', err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* 忽略注销网络错误 */
    }
    setUser(null);
  }, []);

  return { user, loading, refresh, setUser, logout };
}
