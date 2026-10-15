'use client';

// ============================================================================
// components/satellite/ApiKeyModal.tsx —— 「配置」弹窗：Credits 计费 + 上游 Key 托管
// ----------------------------------------------------------------------------
// 诚实说明（本模块最重要的设计决策）：
//   "用户绑定自己的 DeepSeek / OpenAI Key，费用直接从用户账户扣除、平台不经手资金"
//   是一个需要【服务端加密托管 + 每次调用时按租户注入】的能力。本项目当前
//   使用的是平台自有的上游 Key（HERMES_CHAT_ENDPOINT），因此：
//     · 可以真实展示的 → 余额、消费明细、充值入口（来自 /api/account/transactions）
//     · 尚未具备的     → 按租户注入用户 Key，界面明确标注「规划中」，不假装已支持
//   这样用户看到的是真相，而不是一个存了 Key 却根本不生效的假开关。
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowPathIcon,
  BanknotesIcon,
  BoltIcon,
  KeyIcon,
  LockClosedIcon,
  ReceiptPercentIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import type { AuthUser } from '@/hooks/useAuth';
import { BTN_GHOST, BTN_PRIMARY, SatelliteModal } from './shared';

interface Txn {
  id: number;
  type: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  recharge: '充值',
  consume: '消费',
  refund: '退款',
  adjust: '调整',
};

export default function ApiKeyModal({
  open,
  onClose,
  user,
  onNeedLogin,
}: {
  open: boolean;
  onClose: () => void;
  user: AuthUser | null;
  onNeedLogin: () => void;
}) {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/account/transactions', { cache: 'no-store' });
      if (res.status === 401) {
        setTxns([]);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { transactions?: Txn[] } | Txn[];
      const list = Array.isArray(data) ? data : Array.isArray(data.transactions) ? data.transactions : [];
      setTxns(list.slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : '明细加载失败');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  return (
    <SatelliteModal title="配置 · 计费与密钥" subtitle="Credits 体系 · 上游模型密钥托管" onClose={onClose} wide>
      {!user ? (
        <div className="space-y-4">
          <p className="text-sm text-white/70">计费与密钥配置绑定在您的账户上，请先完成刷脸登录。</p>
          <button type="button" onClick={onNeedLogin} className={BTN_PRIMARY}>
            <ShieldCheckIcon className="w-4 h-4 inline mr-1.5" />
            刷脸登录
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* --- 余额 --- */}
          <div className="rounded-xl bg-gradient-to-r from-cyan-500/15 to-blue-500/10 border border-cyan-400/25 p-4">
            <p className="text-xs text-white/60 mb-1 flex items-center gap-1.5">
              <BanknotesIcon className="w-4 h-4" /> 我的 Credits 余额
            </p>
            <p className="text-3xl font-bold font-mono text-cyan-200">
              {user.balance}
              <span className="text-sm font-sans font-normal text-white/50 ml-2">Credits</span>
            </p>
            <div className="mt-3 flex gap-2">
              <a href="/recharge" className={BTN_GHOST}>
                去充值
              </a>
              <a href="/account" className={BTN_GHOST}>
                我的账户
              </a>
            </div>
          </div>

          {/* --- 消费明细（真实数据）--- */}
          <div>
            <p className="text-sm text-white/70 mb-2 flex items-center gap-1.5">
              <ReceiptPercentIcon className="w-4 h-4" /> 最近明细
              <button
                type="button"
                onClick={() => void load()}
                className="ml-auto text-xs text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </p>
            {error && <p className="text-xs text-red-300">{error}</p>}
            {!error && txns.length === 0 && !loading && (
              <p className="text-xs text-white/40">暂无记录。完成一次 AI 任务或充值后会在此显示。</p>
            )}
            <ul className="space-y-1.5 max-h-52 overflow-y-auto">
              {txns.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-white/70 truncate mr-3">
                    <span className="text-white/45 mr-2">{TYPE_LABEL[t.type] ?? t.type}</span>
                    {t.reason}
                  </span>
                  <span className={`font-mono flex-shrink-0 ${t.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {t.amount >= 0 ? '+' : ''}
                    {t.amount}
                    <span className="text-white/35 ml-2">余 {t.balanceAfter}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* --- 上游 Key 托管（如实标注阶段）--- */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <KeyIcon className="w-4 h-4 text-amber-300" /> 上游模型密钥（BYO-Key）
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-400/30">
                规划中 · 尚未启用
              </span>
            </p>
            <p className="text-xs text-white/55 leading-relaxed">
              设计目标：您绑定自己的 DeepSeek / OpenAI Key，任务费用从<b>您的账户</b>直接扣除，
              平台不经手资金、不吃差价。该能力需要服务端<b>加密托管 + 按租户注入</b>，
              目前本项目仍统一使用平台上游密钥执行任务。
            </p>
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-black/20 border border-white/10 p-3">
                <p className="text-white/45 mb-1">DeepSeek API Key</p>
                <input
                  disabled
                  placeholder="功能上线后在此粘贴 sk-…"
                  className="w-full bg-transparent text-white/30 placeholder-white/25 outline-none"
                />
              </div>
              <div className="rounded-lg bg-black/20 border border-white/10 p-3">
                <p className="text-white/45 mb-1">OpenAI API Key</p>
                <input
                  disabled
                  placeholder="功能上线后在此粘贴 sk-…"
                  className="w-full bg-transparent text-white/30 placeholder-white/25 outline-none"
                />
              </div>
            </div>
            <p className="text-[11px] text-white/40 flex items-start gap-1.5">
              <LockClosedIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              为什么现在不能填：密钥必须以 AES-256 加密后落库、且只在服务端任务执行时解密使用。
              在此之前提供输入框会导致<b>密钥被明文存在浏览器里却根本不生效</b> —— 那比没有这个功能更危险。
            </p>
          </div>

          {/* --- 计费规则 --- */}
          <div className="rounded-xl bg-sky-500/10 border border-sky-400/30 p-4 text-xs text-sky-100/90 leading-relaxed space-y-1.5">
            <p className="font-semibold flex items-center gap-1.5 text-sky-200">
              <BoltIcon className="w-4 h-4" /> 计费规则
            </p>
            <p>· 统一以 <b>Credits</b> 计价，$1 = 100 Credits 固定锚点，与上游 API 成本波动脱钩。</p>
            <p>· 任务提交时按估算值预扣、完成后按上游返回的真实 <code>usage</code> 多退少补。</p>
            <p>· 每次任务的真实用量与结算金额都会写入上方明细，可逐条追溯。</p>
          </div>
        </div>
      )}
    </SatelliteModal>
  );
}
