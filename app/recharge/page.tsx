'use client';

// ============================================================================
// app/recharge/page.tsx —— 充值 Credits 页面（套餐选择 + PayPal + 万里汇）
// ----------------------------------------------------------------------------
// 产品规则（用户澄清版）：全站开放浏览；充值需登录（刷脸），充值仅服务创作闭环。
// 流程：
//   PayPal    → POST /api/paypal/create-order（返回 approveUrl）→ 跳 PayPal 收银台
//               → 支付完成回跳 /recharge?paypal=success&token=... → 本页自动
//               POST /api/paypal/capture-order 确认到账（幂等）
//   万里汇    → POST /api/payment/worldfirst/create-order → window.open(paymentUrl)
//               → 万里汇 Webhook 验签到账 → 本页「刷新余额」或窗口聚焦自动刷新
// 定价锚点：$1 = 100 Credits（SOP 19 固定锚点，不随成本波动）
// 合规：预付费充值钱包，不做先买后付（BNPL）
// ============================================================================

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
  WalletIcon,
} from '@heroicons/react/24/outline';
import FaceAuthModal from '@/components/FaceAuthModal';
import { useAuth } from '@/hooks/useAuth';

/* ============================================================================
 * 一、常量
 * ========================================================================= */

const PACKAGES: ReadonlyArray<{ usd: number; credits: number; label: string }> = [
  { usd: 5, credits: 500, label: '尝鲜体验' },
  { usd: 10, credits: 1000, label: '入门创作' },
  { usd: 25, credits: 2500, label: '进阶达人' },
  { usd: 50, credits: 5000, label: '全球制片人' },
];

const ORDER_TIMEOUT_MS = 20_000;
const CAPTURE_TIMEOUT_MS = 20_000;

type Paying = 'idle' | 'paypal' | 'worldfirst' | 'capturing';

interface ApiErrorShape {
  code?: string;
  message?: string;
  requestId?: string;
}

function friendlyError(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'ERR_AUTH':
      return '登录状态已失效，请重新刷脸登录';
    case 'ERR_RATE_LIMITED':
      return '操作过于频繁，请稍后再试';
    case 'ERR_UPSTREAM':
      return '支付渠道暂不可用，请稍后再试';
    case 'ERR_LEDGER':
      return '到账处理异常，请稍后刷新余额或联系客服';
    default:
      return fallback || '操作失败，请稍后重试';
  }
}

/* ============================================================================
 * 二、主内容（客户端）
 * ========================================================================= */

function RechargeInner() {
  const sp = useSearchParams();
  const { user, loading: authLoading, refresh, setUser } = useAuth();

  const [selectedUsd, setSelectedUsd] = useState(10);
  const [paying, setPaying] = useState<Paying>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [errorRequestId, setErrorRequestId] = useState<string | undefined>();
  const [infoMsg, setInfoMsg] = useState('');
  const [captureResult, setCaptureResult] = useState<{ credits: number; balance: number } | null>(null);
  const [showFaceAuth, setShowFaceAuth] = useState(false);
  const capturedRef = useRef(false); // 防止回跳后重复捕获

  const selected = PACKAGES.find((p) => p.usd === selectedUsd) ?? PACKAGES[1]!;
  const needsFaceAuth = !authLoading && !user;
  const busy = paying !== 'idle';

  /* ---- 窗口聚焦自动刷新余额（万里汇支付完成后回来自动到账显示） ---- */
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  /* ---- PayPal 回跳自动捕获（幂等：ref 防重复 + 服务端订单状态幂等） ---- */
  useEffect(() => {
    if (authLoading || !user) return;
    const paypalStatus = sp.get('paypal');
    const token = sp.get('token');
    if (paypalStatus === 'success' && token && !capturedRef.current) {
      capturedRef.current = true;
      void (async () => {
        setPaying('capturing');
        setErrorMsg('');
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), CAPTURE_TIMEOUT_MS);
        try {
          const res = await fetch('/api/paypal/capture-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: token }),
            signal: ctrl.signal,
          });
          const data = (await res.json().catch(() => null)) as
            | ({ success?: boolean; credits?: number; balance?: number } & ApiErrorShape)
            | null;
          if (!res.ok || !data?.success) {
            const e = new Error(data?.message || `确认支付失败（HTTP ${res.status}）`) as Error & ApiErrorShape;
            e.code = data?.code;
            e.requestId = data?.requestId;
            throw e;
          }
          setCaptureResult({ credits: Number(data.credits ?? 0), balance: Number(data.balance ?? 0) });
          setInfoMsg(`✅ 充值成功，${Number(data.credits ?? 0)} Credits 已到账！`);
          void refresh();
        } catch (e) {
          const err = e as Error & ApiErrorShape;
          setErrorMsg(err.name === 'AbortError' ? '确认支付超时，请点击刷新余额' : friendlyError(err.code, err.message));
          setErrorCode(err.code);
          setErrorRequestId(err.requestId);
        } finally {
          clearTimeout(timer);
          setPaying('idle');
        }
      })();
    } else if (paypalStatus === 'cancel') {
      setInfoMsg('您已取消 PayPal 支付，可重新选择套餐。');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, sp]);

  /* ---- PayPal：下单 → 跳转收银台 ---- */
  const handlePaypal = useCallback(async () => {
    if (!user || busy) return;
    setPaying('paypal');
    setErrorMsg('');
    setErrorCode(undefined);
    setErrorRequestId(undefined);
    setInfoMsg('');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ORDER_TIMEOUT_MS);
    try {
      const res = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd: selectedUsd }),
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => null)) as ({ success?: boolean; approveUrl?: string } & ApiErrorShape) | null;
      if (!res.ok || !data?.success || !data.approveUrl) {
        const e = new Error(data?.message || `PayPal 下单失败（HTTP ${res.status}）`) as Error & ApiErrorShape;
        e.code = data?.code;
        e.requestId = data?.requestId;
        throw e;
      }
      // 服务端重定向流：跳转 PayPal 收银台，完成支付后自动回跳本页
      window.location.assign(data.approveUrl);
    } catch (e) {
      const err = e as Error & ApiErrorShape;
      setErrorMsg(friendlyError(err.code, err.message));
      setErrorCode(err.code);
      setErrorRequestId(err.requestId);
      setPaying('idle');
    } finally {
      clearTimeout(timer);
    }
  }, [user, busy, selectedUsd]);

  /* ---- 万里汇：下单 → 新窗口跳支付页 ---- */
  const handleWorldFirst = useCallback(async () => {
    if (!user || busy) return;
    setPaying('worldfirst');
    setErrorMsg('');
    setErrorCode(undefined);
    setErrorRequestId(undefined);
    setInfoMsg('');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ORDER_TIMEOUT_MS);
    try {
      const res = await fetch('/api/payment/worldfirst/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd: selectedUsd }),
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => null)) as ({ success?: boolean; paymentUrl?: string } & ApiErrorShape) | null;
      if (!res.ok || !data?.success || !data.paymentUrl) {
        const e = new Error(data?.message || `万里汇下单失败（HTTP ${res.status}）`) as Error & ApiErrorShape;
        e.code = data?.code;
        e.requestId = data?.requestId;
        throw e;
      }
      const win = window.open(data.paymentUrl, '_blank', 'noopener,noreferrer');
      if (!win) {
        setInfoMsg('浏览器拦截了弹窗，请允许本站弹出窗口后重试');
      } else {
        setInfoMsg('✅ 已在新窗口打开万里汇支付页：完成支付后回到本页点击「刷新余额」即可到账。');
      }
    } catch (e) {
      const err = e as Error & ApiErrorShape;
      setErrorMsg(friendlyError(err.code, err.message));
      setErrorCode(err.code);
      setErrorRequestId(err.requestId);
    } finally {
      clearTimeout(timer);
      setPaying('idle');
    }
  }, [user, busy, selectedUsd]);

  /* ---- 渲染 ---- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-purple-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* 页头 */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
            <span className="text-white text-xl">💰</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">充值 Credits</h1>
            <p className="text-sm text-gray-500">预付费钱包 · 用于 AI 创作与发布 · 固定锚点 $1 = 100 Credits</p>
          </div>
          <div className="ml-auto">
            {user ? (
              <span className="inline-flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-full bg-green-100 text-green-700">
                <WalletIcon className="w-4 h-4" />
                余额 {user.balance} Credits
              </span>
            ) : (
              <span className="text-xs text-gray-400">请先刷脸登录</span>
            )}
          </div>
        </div>

        {authLoading ? (
          <div className="bg-white rounded-2xl shadow-md p-8 text-center text-gray-500">正在校验登录状态…</div>
        ) : needsFaceAuth ? (
          /* 闸门：充值需登录（刷脸） */
          <div className="bg-white rounded-2xl shadow-md p-10 text-center">
            <div className="text-5xl mb-4">🪪</div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">充值前需刷脸登录</h2>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              本站仅支持人脸注册/登录（腾讯云基础人脸核身），无需邮箱密码、无需腾讯云账号。
            </p>
            <button
              type="button"
              onClick={() => setShowFaceAuth(true)}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              开始刷脸 · 登录 / 注册
            </button>
            <p className="mt-4 text-xs text-gray-400">全站浏览无需登录，充值仅服务创作闭环</p>
          </div>
        ) : (
          <>
            {/* 套餐选择 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {PACKAGES.map((p) => {
                const active = p.usd === selectedUsd;
                return (
                  <button
                    key={p.usd}
                    type="button"
                    disabled={busy}
                    onClick={() => setSelectedUsd(p.usd)}
                    aria-pressed={active}
                    className={`rounded-2xl border-2 p-4 text-center transition-all ${
                      active
                        ? 'border-purple-500 bg-purple-50 shadow-md'
                        : 'border-gray-200 bg-white hover:border-purple-300'
                    } disabled:opacity-60`}
                  >
                    <p className="text-2xl font-bold text-gray-800">${p.usd}</p>
                    <p className="text-sm text-purple-600 font-semibold mt-1">{p.credits} Credits</p>
                    <p className="text-[11px] text-gray-400 mt-1">{p.label}</p>
                  </button>
                );
              })}
            </div>

            {/* 支付方式 */}
            <div className="bg-white rounded-2xl shadow-md p-6 space-y-4">
              <h2 className="font-bold text-gray-800">
                支付 <b className="text-purple-600">{selected.credits} Credits</b>（${selected.usd} USD）
              </h2>

              <button
                type="button"
                onClick={() => void handlePaypal()}
                disabled={busy}
                className="w-full py-4 rounded-xl bg-[#0070ba] hover:bg-[#005ea6] text-white font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {paying === 'paypal' ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    正在跳转 PayPal…
                  </>
                ) : (
                  <>🅿️ 使用 PayPal 支付（支持全球信用卡）</>
                )}
              </button>

              <button
                type="button"
                onClick={() => void handleWorldFirst()}
                disabled={busy}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {paying === 'worldfirst' ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    正在创建万里汇订单…
                  </>
                ) : (
                  <>🌍 使用万里汇支付（跨境收款）</>
                )}
              </button>

              {/* 万里汇支付后引导 */}
              {infoMsg && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 flex items-start gap-2">
                  <GlobeAltIcon className="w-5 h-5 flex-shrink-0" />
                  <div className="flex-1">
                    <p>{infoMsg}</p>
                    {infoMsg.includes('万里汇') && (
                      <button
                        type="button"
                        onClick={() => void refresh()}
                        className="mt-3 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                      >
                        已支付？刷新余额
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 到账成功 */}
              {captureResult && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5 flex items-center gap-3">
                  <CheckCircleIcon className="w-8 h-8 text-green-500 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-green-800">
                      {captureResult.credits} Credits 已到账！
                    </p>
                    <p className="text-sm text-gray-600">当前余额：{captureResult.balance} Credits</p>
                  </div>
                </div>
              )}

              {/* 错误 */}
              {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-start gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-red-700">{errorMsg}</p>
                      {errorCode && <p className="mt-1 text-xs text-red-500 font-mono">错误码：{errorCode}</p>}
                      {errorRequestId && <p className="text-xs text-red-400 font-mono break-all">RequestId：{errorRequestId}</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 说明与合规 */}
            <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-xs text-gray-500 space-y-2">
              <p className="flex items-center gap-1">
                <ShieldCheckIcon className="w-4 h-4 text-green-600" />
                <b>合规说明</b>：本站为预付费充值钱包模式，不提供先买后付（BNPL）。
              </p>
              <p>
                💡 PayPal：点击后跳转 PayPal 安全收银台，支付完成自动回跳并到账；若页面未跳转，请返回本页点击「刷新余额」。
              </p>
              <p>
                💡 万里汇：支付后由平台 Webhook 验签自动到账；如遇延迟可联系客服并提供订单号。
              </p>
              <p>
                💡 Credits 用途：AI 视频一键生成（50/次）· 作品上架发布（20/部）· 极客空间创作（创建即用）。
              </p>
              <Link href="/blog" className="inline-block mt-1 text-purple-500 hover:underline">
                ← 回到电影墙
              </Link>
            </div>
          </>
        )}
      </div>

      <FaceAuthModal
        open={showFaceAuth}
        onClose={() => setShowFaceAuth(false)}
        onSuccess={(u) => {
          setUser(u);
          setShowFaceAuth(false);
        }}
      />
    </div>
  );
}

/* ============================================================================
 * 三、页面出口（Suspense 包裹：useSearchParams 的 App Router 要求）
 * ========================================================================= */

export default function RechargePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-500">
          <span className="w-6 h-6 border-2 border-purple-300 border-t-purple-500 rounded-full animate-spin" />
          <span className="ml-3">正在加载充值页…</span>
        </div>
      }
    >
      <RechargeInner />
    </Suspense>
  );
}
