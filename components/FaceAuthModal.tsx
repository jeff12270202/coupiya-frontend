'use client';

/**
 * FaceAuthModal —— 刷脸注册弹窗（注册模式 v2）
 *
 * 规则（用户澄清版 v2）：
 *   - 人脸识别只用于【首次注册】（腾讯云基础版人脸核身）；
 *   - 注册完成后必须【设置强密码】（登录账号 + 密码）；
 *   - 以后登录直接用 账号+密码（/login），不再需要人脸识别。
 *
 * 步骤：
 *   intro（说明）→ verifying（等待刷脸，轮询）→ 注册成功但未设密码 →
 *   setpassword（补设账号+强密码，调 /api/auth/password/set）→ 完成回调。
 *   已注册人脸（服务端 status:'exists'）→ 提示改用账号密码登录（/login）。
 *
 * 后端契约：
 *   POST /api/auth/face/start → { ticket, verifyUrl }
 *   GET  /api/auth/face/result?ticket= → 202 pending / {status:'success'|'failed'|'exists',user?,message?}
 *   POST /api/auth/password/set → { success, user }（需登录会话）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { AuthUser } from '@/hooks/useAuth';

interface FaceAuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
}

type Step = 'intro' | 'verifying' | 'exists' | 'setpassword' | 'error';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 180_000;

export default function FaceAuthModal({ open, onClose, onSuccess }: FaceAuthModalProps) {
  const [step, setStep] = useState<Step>('intro');
  const [message, setMessage] = useState('');

  // 密码表单
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const resetAll = useCallback(() => {
    clearPoll();
    setStep('intro');
    setMessage('');
    setUsername('');
    setPassword('');
    setConfirm('');
    setFormError('');
    setSubmitting(false);
  }, [clearPoll]);

  const close = useCallback(() => {
    resetAll();
    onClose();
  }, [resetAll, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearPoll();
    };
  }, [open, close, clearPoll]);

  /* ---- 密码本地校验（与后端规则一致） ---- */
  const clientValidate = useCallback((): string => {
    const user = username.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{3,23}$/.test(user)) {
      return '登录账号需以字母开头，仅含字母/数字/下划线，长度 4-24 位';
    }
    if (password.length < 8 || password.length > 128) return '密码长度需为 8-128 位';
    let classes = 0;
    if (/[A-Z]/.test(password)) classes += 1;
    if (/[a-z]/.test(password)) classes += 1;
    if (/[0-9]/.test(password)) classes += 1;
    if (/[^A-Za-z0-9]/.test(password)) classes += 1;
    if (classes < 3) return '强密码需包含 大写/小写/数字/符号 中的至少三类';
    if (password !== confirm) return '两次输入的密码不一致';
    return '';
  }, [username, password, confirm]);

  /* ---- 轮询核身结果 ---- */
  const startPolling = useCallback(
    (ticket: string) => {
      const startedAt = Date.now();
      clearPoll();
      pollTimer.current = setInterval(async () => {
        try {
          if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            clearPoll();
            setStep('error');
            setMessage('刷脸超时，请关闭窗口后重试');
            return;
          }
          const res = await fetch(`/api/auth/face/result?ticket=${encodeURIComponent(ticket)}`, {
            cache: 'no-store',
          });
          const data = (await res.json().catch(() => ({}))) as {
            status?: string;
            user?: AuthUser;
            message?: string;
            error?: string;
          };
          if (!res.ok && res.status !== 202) {
            throw new Error(data?.error || `HTTP ${res.status}`);
          }
          if (data?.status === 'success' && data?.user) {
            clearPoll();
            if (data.user.needsPassword) {
              // 新注册：必须先设置强密码
              setStep('setpassword');
              setUsername(`cp${data.user.id}`);
              setMessage(`欢迎，${data.user.nickname || '创作者'}！请设置登录账号与强密码（此后将用密码登录）。`);
            } else {
              setStep('intro'); // 理论不可达（v2 新人必 needsPassword）
              onSuccess(data.user as AuthUser);
              close();
            }
          } else if (data?.status === 'exists') {
            // 该人脸已注册过 → 改走 账号+密码 登录
            clearPoll();
            setMessage(data?.message || '该人脸已完成注册，请使用账号密码登录。');
            setStep('exists');
          } else if (data?.status === 'failed') {
            clearPoll();
            setStep('error');
            setMessage('人脸核身未通过，请确保光线充足、面部无遮挡后重试');
          }
        } catch (err) {
          clearPoll();
          setStep('error');
          setMessage(err instanceof Error ? err.message : '查询核身结果失败，请重试');
        }
      }, POLL_INTERVAL_MS);
    },
    [clearPoll, close, onSuccess],
  );

  /* ---- 发起刷脸 ---- */
  const startFaceVerify = useCallback(async () => {
    setMessage('');
    setStep('verifying');
    try {
      const res = await fetch('/api/auth/face/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { verifyUrl?: string; ticket?: string; error?: string };
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (!data?.verifyUrl || !data?.ticket) throw new Error('后端未返回人脸核身链接，请联系管理员');
      const win = window.open(data.verifyUrl, '_blank', 'noopener,noreferrer');
      if (!win) setMessage('浏览器拦截了弹窗，请允许本站弹出窗口后点击「重新发起刷脸」');
      startPolling(data.ticket as string);
    } catch (err) {
      setStep('error');
      setMessage(err instanceof Error ? err.message : '发起刷脸失败，请稍后重试');
    }
  }, [startPolling]);

  /* ---- 提交强密码（补设账号+密码，一次性） ---- */
  const submitPassword = useCallback(async () => {
    if (submitting) return;
    const invalid = clientValidate();
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const res = await fetch('/api/auth/password/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; user?: AuthUser; error?: string; code?: string };
      if (!res.ok || !data?.user) {
        throw new Error(data?.error || data?.code || `HTTP ${res.status}`);
      }
      setStep('intro');
      onSuccess(data.user as AuthUser);
      close();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '设置密码失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, clientValidate, username, password, onSuccess, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="刷脸注册"
      onClick={close}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          aria-label="关闭"
          className="absolute right-4 top-4 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors"
        >
          ✕
        </button>

        {step === 'intro' && (
          <div className="text-center">
            <div className="text-5xl mb-4">🪪</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">刷脸注册，然后设置强密码</h3>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              本站支持<b>人脸注册 / 登录</b>（腾讯云基础人脸核身），
              <br />
              无需邮箱密码、<b>无需腾讯云账号</b>——您只属于 Coupiya。
              <br />
              刷脸通过后请立即设置<b>登录账号 + 强密码</b>，
              <br />
              今后登录请使用 <Link href="/login" className="text-purple-600 font-semibold hover:underline" onClick={close}>账号 + 密码（前往登录页）</Link>。
            </p>
            <button
              type="button"
              onClick={startFaceVerify}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
            >
              开始刷脸 · 注册
            </button>
            <p className="mt-4 text-xs text-gray-400">
              点击即代表同意《用户协议》与《隐私政策》 · 人脸信息仅用于首次注册核验
            </p>
          </div>
        )}

        {step === 'verifying' && (
          <div className="text-center py-4">
            <div className="w-14 h-14 mx-auto mb-4 border-4 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
            <h3 className="text-lg font-bold text-gray-800 mb-2">正在等待您完成刷脸…</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              若已弹出核身窗口，请在窗口中完成动作；
              <br />
              若窗口未弹出：{message || '请检查浏览器弹窗设置'}
            </p>
            <button
              type="button"
              onClick={startFaceVerify}
              className="mt-5 px-5 py-2.5 rounded-lg border border-purple-300 text-purple-600 hover:bg-purple-50 transition-colors"
            >
              重新发起刷脸
            </button>
          </div>
        )}

        {step === 'exists' && (
          <div className="text-center py-4">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-sky-100 text-sky-600 text-3xl flex items-center justify-center">
              🔐
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">您已注册过</h3>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">{message}</p>
            <div className="flex flex-col gap-3">
              <Link
                href="/login"
                onClick={close}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg hover:shadow-xl transition-all text-center"
              >
                前往 账号+密码 登录
              </Link>
              <button
                type="button"
                onClick={close}
                className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200 transition-colors"
              >
                稍后再说
              </button>
            </div>
          </div>
        )}

        {step === 'setpassword' && (
          <div>
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🔐</div>
              <h3 className="text-lg font-bold text-gray-800 mb-1">最后一步：设置登录账号与强密码</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                注册成功！从今往后登录本站只需<b>账号 + 密码</b>，不再需要刷脸。
              </p>
            </div>
            {message && <p className="text-xs text-green-600 mb-3 text-center">{message}</p>}
            <div className="space-y-3">
              <div>
                <label htmlFor="fau-username" className="block text-sm font-medium text-gray-700 mb-1">
                  登录账号（字母开头，4-24 位）
                </label>
                <input
                  id="fau-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={24}
                  placeholder="例如 cp2026"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label htmlFor="fau-password" className="block text-sm font-medium text-gray-700 mb-1">
                  强密码（8-128 位）
                </label>
                <input
                  id="fau-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={128}
                  placeholder="至少含 大写/小写/数字/符号 三类"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label htmlFor="fau-confirm" className="block text-sm font-medium text-gray-700 mb-1">
                  确认密码
                </label>
                <input
                  id="fau-confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  maxLength={128}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              {formError && <p className="text-xs text-red-600">{formError}</p>}
              <button
                type="button"
                onClick={() => void submitPassword()}
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg hover:shadow-xl disabled:opacity-60 transition-all"
              >
                {submitting ? '保存中…' : '保存并进入创作空间'}
              </button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">操作失败</h3>
            <p className="text-sm text-gray-500 mb-6 break-words">{message}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={startFaceVerify}
                className="flex-1 py-3 rounded-xl bg-purple-500 text-white font-semibold hover:bg-purple-600 transition-colors"
              >
                重试
              </button>
              <button
                type="button"
                onClick={close}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200 transition-colors"
              >
                稍后再说
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
