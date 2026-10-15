'use client';

// ============================================================================
// app/login/page.tsx —— 账号 + 强密码 登录（刷脸注册后的唯一登录方式）
// ----------------------------------------------------------------------------
// 规则（用户澄清版 v2）：
//   人脸只用于首次注册；注册后设置 账号+强密码；以后登录只用密码，不再刷脸。
// 页面能力：
//   1. 密码登录（/api/auth/login，限流+统一错误文案）
//   2. 刷脸注册（FaceAuthModal：核身 → 自动进入补设强密码步骤）
//   3. 会话存在但 needsPassword（历史遗留）→ 直接进入补设密码表单
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import FaceAuthModal from '@/components/FaceAuthModal';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, setUser, refresh } = useAuth();

  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showFace, setShowFace] = useState(false);

  /* ---- 密码登录 ---- */
  const handleLogin = useCallback(async () => {
    if (busy || !account.trim() || !password) {
      setErrorMsg('请输入账号与密码');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: account.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; user?: Parameters<typeof setUser>[0]; error?: string; code?: string };
      if (!res.ok || !data?.user) {
        throw new Error(data?.error || data?.code || `HTTP ${res.status}`);
      }
      setUser(data.user);
      router.push('/account');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '登录失败，请重试');
    } finally {
      setBusy(false);
    }
  }, [busy, account, password, router, setUser]);

  /* ---- 已登录：needsPassword → 引导补设；否则回个人中心 ---- */
  useEffect(() => {
    if (loading) return;
    if (user && !user.needsPassword) {
      router.replace('/account');
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-purple-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-2xl font-bold text-gray-800">欢迎回来</h1>
          <p className="text-sm text-gray-500 mt-1">使用 账号 + 密码 登录（刷脸仅用于首次注册）</p>
        </div>

        {user?.needsPassword ? (
          /* 历史账号补设密码：提示回刷脸流程或直接走补设（复用组件流程较复杂，
             此处引导用已登录会话调用密码补设需单独接口——直接引导刷脸弹窗会返回 exists，
             因此引导到个人中心内完成：见 /account 顶部提示） */
          <div className="bg-white rounded-2xl shadow-md p-6 text-center text-sm text-gray-600">
            您的账号尚未设置密码。请点击下方按钮完成「刷脸核身校验」后补设（若提示“已注册”，
            请退出登录后重新用刷脸入口进入补设步骤）。
            <div className="mt-4 flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => router.push('/account')}
                className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200 transition-colors"
              >
                前往个人中心
              </button>
              <button
                type="button"
                onClick={() => void refresh()}
                className="px-5 py-2.5 rounded-xl bg-purple-500 text-white font-semibold hover:bg-purple-600 transition-colors"
              >
                刷新状态
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-md p-6 space-y-4">
            <div>
              <label htmlFor="login-account" className="block text-sm font-medium text-gray-700 mb-1.5">
                登录账号（注册时设置）
              </label>
              <input
                id="login-account"
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                autoComplete="username"
                maxLength={64}
                placeholder="例如 cp2026"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                强密码
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleLogin();
                  }
                }}
                autoComplete="current-password"
                maxLength={128}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {errorMsg && <p className="text-sm text-red-600">⚠️ {errorMsg}</p>}

            <button
              type="button"
              onClick={() => void handleLogin()}
              disabled={busy}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg hover:shadow-xl disabled:opacity-60 transition-all"
            >
              {busy ? '登录中…' : '登录'}
            </button>

            <div className="relative text-center py-1">
              <span className="text-xs text-gray-400 bg-white px-3 relative z-10">或</span>
              <div className="absolute inset-x-0 top-1/2 h-px bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={() => setShowFace(true)}
              className="w-full py-3 rounded-xl border-2 border-purple-300 text-purple-600 font-semibold hover:bg-purple-50 transition-colors"
            >
              🪪 新用户？刷脸注册
            </button>

            <p className="text-center text-xs text-gray-400">
              忘记密码？暂不支持自助找回（安全策略），请通过站内客服协助。
              <br />
              <Link href="/" className="text-purple-500 hover:underline">← 回到首页</Link>
            </p>
          </div>
        )}
      </div>

      <FaceAuthModal
        open={showFace}
        onClose={() => setShowFace(false)}
        onSuccess={(u) => {
          setUser(u);
          setShowFace(false);
          router.push('/account');
        }}
      />
    </div>
  );
}
