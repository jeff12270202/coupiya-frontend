'use client';

/**
 * VideoModal —— 「AI 视频 · 一键生成并发布」弹窗（引擎1：新手黑盒模式）
 * ============================================================================
 * 产品规则（用户澄清版）：
 *   - 全站浏览完全开放、无需注册充值；
 *   - 仅「AI 视频生成」与「极速AI极客创作空间」两个创作入口强制刷脸登录 + 余额；
 *   - 本弹窗 = AI 视频生成入口 → 必须【刷脸登录】+【余额 > 0】才可创作。
 *
 * 后端契约（与镜像路由一致）：
 *   POST /api/ai/generate-video
 *     Header: x-coupiya-user-id: <登录用户ID>（必填，账本预扣费）
 *     Body:   { prompt, input_image? }
 *     200:    { success, videoUrl, source, warnings, requestId }
 *     4xx/5xx:{ success:false, code, message, requestId }
 *             code: ERR_AUTH / INSUFFICIENT_BALANCE / ERR_RATE_LIMITED /
 *                   ERR_VOD / ERR_WORDPRESS / ERR_UPSTREAM / ERR_LEDGER ...
 *
 *   POST /api/ai/publish-vod-movie
 *     Body:   { aiVideoUrl|video_url, movieTitle|title, description?, ... }
 *     200:    { success, postId, movie:{ id, slug, link, fileId, playUrl, author_user_id }, warnings, requestId }
 *
 * 设计要点：
 *   1. 双闸门：未登录 → 刷脸弹窗；余额 ≤ 0 → 充值引导（本弹窗内完成，不拦截全站）
 *   2. 诚实流水线：每一步状态只由真实接口返回驱动，绝不 fake 成功/占位视频
 *   3. 全请求带 x-coupiya-user-id + 超时 + AbortController（卸载/关闭即中止）
 *   4. 错误码映射友好文案 + requestId 透出便于客服排障
 *   5. Enter 提交带中文输入法（IME）守卫；Esc 关闭；aria 无障碍
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  ExclamationTriangleIcon,
  FilmIcon,
  GlobeAltIcon,
  LinkIcon,
  RocketLaunchIcon,
  SparklesIcon,
  WalletIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import FaceAuthModal from '@/components/FaceAuthModal';
import { useAuth } from '@/hooks/useAuth';

/* ============================================================================
 * 一、常量与类型
 * ========================================================================= */

/** 计费展示（以后端 env 为准：VIDEO_GENERATION_COST / PUBLISH_COST_CREDITS） */
const COST_GENERATE = 50; // AI 生成（generate-video 预扣）
const COST_PUBLISH = 20; // 上架发布（publish-vod-movie 预扣）
const TOTAL_COST = COST_GENERATE + COST_PUBLISH;

const PROMPT_MAX = 2000; // 与后端 maxPromptChars 保持一致
const TITLE_MAX = 120; // 与后端 maxTitleChars 保持一致
const GEN_TIMEOUT_MS = 240_000; // 生成最多 4 分钟
const PUBLISH_TIMEOUT_MS = 290_000; // 发布（VOD 轮询）最多 ~5 分钟

type Stage = 'idle' | 'generating' | 'publishing' | 'done' | 'error';
type StepStatus = 'pending' | 'active' | 'done' | 'error';

interface GenerateResponse {
  success: boolean;
  videoUrl?: string;
  source?: string;
  warnings?: string[];
  requestId?: string;
}

interface PublishResponse {
  success: boolean;
  postId: number;
  movie?: {
    id?: number;
    slug?: string;
    link?: string;
    fileId?: string;
    playUrl?: string;
    author_user_id?: number;
  };
  warnings?: string[];
  requestId?: string;
}

interface PublishResult {
  postId: number;
  fileId: string;
  playUrl: string;
  slug: string;
  wpLink: string;
  frontLink: string;
}

/** 后端统一错误体 */
class ApiRequestError extends Error {
  code?: string;
  status: number;
  requestId?: string;
  constructor(message: string, status: number, code?: string, requestId?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** 流水线步骤（状态由真实接口驱动） */
const PIPELINE_STEPS: { key: string; label: string }[] = [
  { key: 'optimize', label: 'DeepSeek 优化提示词' },
  { key: 'generate', label: 'AI 模型生成视频' },
  { key: 'vod', label: '腾讯云 VOD 全球转码' },
  { key: 'publish', label: '自动上架全球电影墙' },
];

function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'movie'
  );
}

/** 错误码 → 全球用户友好文案（服务端原始 message 作为兜底） */
function friendlyError(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'INSUFFICIENT_BALANCE':
      return '余额不足，请先充值后再创作';
    case 'ERR_AUTH':
      return '登录状态已失效，请重新刷脸登录';
    case 'ERR_RATE_LIMITED':
      return '操作过于频繁，请稍后再试';
    case 'ERR_VOD':
      return '视频转码失败，本次费用已自动退回';
    case 'ERR_WORDPRESS':
      return '上架失败，本次费用已自动退回';
    case 'ERR_UPSTREAM':
      return 'AI 生成服务暂不可用，本次费用已自动退回';
    case 'ERR_LEDGER':
      return '计费服务异常，请稍后再试';
    default:
      return fallback || '操作失败，请稍后重试';
  }
}

/* ============================================================================
 * 二、通用请求封装（超时 + 外部信号合并 + 统一错误解析）
 * ========================================================================= */

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  opts: { timeoutMs: number; signal?: AbortSignal },
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  const onOuterAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onOuterAbort, { once: true });
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || data === null) {
      const message = data && typeof data.message === 'string' ? data.message : `请求失败（HTTP ${res.status}）`;
      const code = data && typeof data.code === 'string' ? data.code : undefined;
      const requestId = data && typeof data.requestId === 'string' ? data.requestId : undefined;
      throw new ApiRequestError(message, res.status, code, requestId);
    }
    return data as T;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/* ============================================================================
 * 三、流水线进度组件（诚实状态渲染）
 * ========================================================================= */

function PipelineProgress({ statuses }: { statuses: StepStatus[] }) {
  const icons = [<SparklesIcon key="i0" className="w-5 h-5" />, <FilmIcon key="i1" className="w-5 h-5" />, <CloudArrowUpIcon key="i2" className="w-5 h-5" />, <RocketLaunchIcon key="i3" className="w-5 h-5" />];
  return (
    <div className="space-y-3">
      {PIPELINE_STEPS.map((step, idx) => {
        const status = statuses[idx] ?? 'pending';
        return (
          <div key={step.key} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                status === 'done'
                  ? 'bg-green-500 text-white shadow-md shadow-green-200'
                  : status === 'active'
                    ? 'bg-blue-500 text-white animate-pulse shadow-md shadow-blue-200'
                    : status === 'error'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200 text-gray-400'
              }`}
            >
              {status === 'done' ? <CheckCircleIcon className="w-5 h-5" /> : icons[idx]}
            </div>
            <span
              className={`text-sm transition-colors duration-300 ${
                status === 'done'
                  ? 'text-green-700 font-medium'
                  : status === 'active'
                    ? 'text-blue-700 font-semibold'
                    : status === 'error'
                      ? 'text-red-600'
                      : 'text-gray-400'
              }`}
            >
              {step.label}
              {status === 'active' && <span className="ml-1 inline-block animate-pulse">…</span>}
            </span>
            {idx < PIPELINE_STEPS.length - 1 && (
              <div className={`ml-3 w-0.5 h-4 transition-colors duration-500 ${status === 'done' ? 'bg-green-300' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================================
 * 四、主组件
 * ========================================================================= */

export default function VideoModal({ onClose }: { onClose: () => void }) {
  const { user, loading: authLoading, refresh, setUser } = useAuth();

  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(['pending', 'pending', 'pending', 'pending']);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [errorRequestId, setErrorRequestId] = useState<string | undefined>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [showFaceAuth, setShowFaceAuth] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const isRunning = stage === 'generating' || stage === 'publishing';
  const needsFaceAuth = !authLoading && !user;
  const needsRecharge = !authLoading && !!user && user.balance <= 0;
  const balanceLow = !!user && user.balance > 0 && user.balance < TOTAL_COST;

  /* ---- 重置流水线（同时中止进行中的请求） ---- */
  const resetPipeline = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStage('idle');
    setStepStatuses(['pending', 'pending', 'pending', 'pending']);
    setErrorMsg('');
    setErrorCode(undefined);
    setErrorRequestId(undefined);
    setWarnings([]);
    setPublishResult(null);
  }, []);

  /* ---- 关闭（运行中需二次确认；服务端处理不会因关窗中断） ---- */
  const handleClose = useCallback(() => {
    if (isRunning) {
      const ok = window.confirm('流水线正在运行中…关闭窗口不会中断服务端处理，已产生的费用不退回。确定关闭吗？');
      if (!ok) return;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    onClose();
  }, [isRunning, onClose]);

  /* ---- Esc 关闭 + 锁定页面滚动 + 卸载时中止请求 ---- */
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !isRunning) handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [isRunning, handleClose]);

  /* ---- 核心流水线：生成 → 发布（真实接口驱动，诚实状态） ---- */
  const runPipeline = useCallback(async () => {
    if (!user || isRunning) return;
    const trimmed = prompt.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setErrorMsg('');
    setErrorCode(undefined);
    setErrorRequestId(undefined);
    setWarnings([]);
    setPublishResult(null);
    setStepStatuses(['active', 'active', 'pending', 'pending']);
    setStage('generating');

    try {
      // ① AI 生成（DeepSeek 优化 + 模型生成 + 账本预扣，均在服务端完成）
      const gen = await fetchJson<GenerateResponse>(
        '/api/ai/generate-video',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-coupiya-user-id': String(user.id) },
          body: JSON.stringify({ prompt: trimmed }),
        },
        { timeoutMs: GEN_TIMEOUT_MS, signal: ctrl.signal },
      );
      if (!gen.videoUrl) {
        throw new ApiRequestError('服务未返回视频地址', 502, 'ERR_UPSTREAM', gen.requestId);
      }
      setWarnings(Array.isArray(gen.warnings) ? gen.warnings.map(String) : []);

      // ② 发布上墙（VOD 转码 + WordPress 写入 + 发布扣费，均在服务端完成）
      setStepStatuses(['done', 'done', 'active', 'pending']);
      setStage('publishing');
      const pub = await fetchJson<PublishResponse>(
        '/api/ai/publish-vod-movie',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-coupiya-user-id': String(user.id) },
          body: JSON.stringify({
            aiVideoUrl: gen.videoUrl,
            movieTitle: (title.trim() || trimmed).slice(0, TITLE_MAX),
          }),
        },
        { timeoutMs: PUBLISH_TIMEOUT_MS, signal: ctrl.signal },
      );

      const m = pub.movie ?? {};
      setStepStatuses(['done', 'done', 'done', 'done']);
      setPublishResult({
        postId: pub.postId,
        fileId: m.fileId ?? '',
        playUrl: m.playUrl ?? '',
        slug: m.slug ?? '',
        wpLink: m.link ?? '',
        frontLink: `${window.location.origin}/movie/${encodeURIComponent(m.slug || slugify(trimmed))}`,
      });
      setStage('done');
      void refresh(); // 同步最新余额
    } catch (e) {
      const err =
        e instanceof ApiRequestError ? e : new ApiRequestError(e instanceof Error ? e.message : '未知错误', 0);
      setErrorMsg(friendlyError(err.code, err.message));
      setErrorCode(err.code);
      setErrorRequestId(err.requestId);
      setStepStatuses((prev) => prev.map((s) => (s === 'active' ? 'error' : s)));
      setStage('error');
    }
  }, [user, isRunning, prompt, title, refresh]);

  /* ---- 输入快捷键：Enter 提交（含中文输入法守卫） ---- */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return; // 中文拼写中不触发提交
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (stage === 'idle' || stage === 'error') void runPipeline();
    }
  };

  /* ============================================================
   * 渲染
   * ============================================================ */

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="AI 视频 · 一键生成并发布"
      onClick={() => {
        if (!isRunning) handleClose();
      }}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---------- Header ---------- */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 flex items-center justify-center shadow-lg flex-shrink-0">
              <span className="text-white text-xl">🎬</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                {stage === 'done' ? '🎉 发布成功！' : 'AI 视频 · 一键生成并发布'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {stage === 'done' ? '您的电影已通过腾讯云 VOD 分发至全球 CDN' : 'DeepSeek 优化 → AI 生成 → 腾讯云转码 → 自动上架'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {user && (
              <span
                className={`hidden sm:inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                  user.balance > 0
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                }`}
                title="网站账户余额"
              >
                <WalletIcon className="w-3.5 h-3.5" />
                {user.balance} Credits
              </span>
            )}
            <button
              type="button"
              onClick={handleClose}
              aria-label="关闭"
              className="p-2 hover:bg-white/80 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* ---------- Body ---------- */}
        <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
          <div className="max-w-2xl mx-auto space-y-6" aria-live="polite">
            {authLoading && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm text-center text-sm text-gray-500">
                正在校验登录状态…
              </div>
            )}

            {/* 闸门①：刷脸注册/登录（仅创作入口，全站其余开放） */}
            {needsFaceAuth && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm text-center">
                <div className="text-5xl mb-4">🪪</div>
                <h4 className="text-lg font-bold text-gray-800 dark:text-white mb-2">创作前需刷脸登录</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                  本站仅支持<b>人脸注册 / 登录</b>（腾讯云基础人脸核身），
                  <br />
                  无需邮箱密码、<b>无需腾讯云账号</b>——您只属于 Coupiya。
                </p>
                <button
                  type="button"
                  onClick={() => setShowFaceAuth(true)}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg hover:shadow-xl active:scale-[0.98] transition-all"
                >
                  开始刷脸 · 登录 / 注册
                </button>
                <p className="mt-4 text-xs text-gray-400">全站浏览无需登录，仅创作入口需要</p>
              </div>
            )}

            {/* 闸门②：余额不足 → 充值引导 */}
            {needsRecharge && (
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950 rounded-xl border border-amber-200 dark:border-amber-800 p-8 shadow-sm text-center">
                <div className="text-5xl mb-4">💰</div>
                <h4 className="text-lg font-bold text-amber-800 dark:text-amber-300 mb-2">余额不足，请先充值</h4>
                <p className="text-sm text-amber-700 dark:text-amber-400 mb-6 leading-relaxed">
                  当前余额 <b>0 Credits</b> · 单次创作预计消耗 <b>{TOTAL_COST} Credits</b>
                  <br />
                  （AI 生成 {COST_GENERATE} + 上架发布 {COST_PUBLISH}）
                </p>
                <a
                  href="/recharge"
                  className="block w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold shadow-lg hover:shadow-xl active:scale-[0.98] transition-all text-center"
                >
                  立即充值 Credits
                </a>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="mt-3 w-full py-2.5 rounded-xl border border-amber-300 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/40 transition-colors text-sm"
                >
                  已充值？刷新余额
                </button>
              </div>
            )}

            {/* 冻结提示 */}
            {user?.isFrozen && !needsRecharge && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl p-4 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
                账户已被冻结，请联系客服处理后再继续创作。
              </div>
            )}

            {/* 输入区（idle / error / done 可再次输入） */}
            {user && !needsRecharge && (stage === 'idle' || stage === 'error' || stage === 'done') && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="video-prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      🎥 描述你想要的视频画面
                    </label>
                    <textarea
                      id="video-prompt"
                      value={prompt}
                      onChange={(e) => {
                        setPrompt(e.target.value);
                        if (stage === 'done') resetPipeline();
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="例如：赛博朋克风格的未来都市，霓虹灯闪烁，飞行汽车穿梭于高楼之间"
                      rows={3}
                      maxLength={PROMPT_MAX}
                      disabled={isRunning}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-3 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <p className="mt-1 text-right text-xs text-gray-400">{prompt.length}/{PROMPT_MAX}</p>
                  </div>

                  <div>
                    <label htmlFor="video-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      🏷️ 作品标题（可选，默认使用您的描述）
                    </label>
                    <input
                      id="video-title"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="您的 AI 电影标题"
                      maxLength={TITLE_MAX}
                      disabled={isRunning}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-3 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>

                  {balanceLow && (
                    <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                      <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                      当前余额 {user.balance} Credits 低于本次预计消耗 {TOTAL_COST} Credits，可能在中途提示余额不足，建议先充值。
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void runPipeline()}
                    disabled={isRunning || !prompt.trim()}
                    className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 text-white rounded-xl hover:from-blue-700 hover:via-cyan-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold text-lg shadow-lg hover:shadow-xl active:scale-[0.98]"
                  >
                    <RocketLaunchIcon className="w-6 h-6" /> 🚀 一键生成并全球发布
                  </button>
                  <p className="text-center text-xs text-gray-400">
                    本次预计消耗 <b>{TOTAL_COST} Credits</b>（生成 {COST_GENERATE} + 上架 {COST_PUBLISH}）· 当前余额 {user.balance} Credits · 生成失败自动退回
                  </p>
                </div>
              </div>
            )}

            {/* 流水线进度（运行中） */}
            {isRunning && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                  <ArrowPathIcon className="w-4 h-4 animate-spin text-blue-500" />
                  {stage === 'generating' ? '🤖 AI 正在生成视频…' : '☁️ 正在转码并上架全球电影墙…'}
                </p>
                <PipelineProgress statuses={stepStatuses} />
                <p className="text-xs text-gray-400 mt-4">预计耗时 15 秒 ~ 3 分钟，请勿关闭窗口；余额不足或生成失败将自动退回 Credits。</p>
              </div>
            )}

            {/* 成功卡片 */}
            {stage === 'done' && publishResult && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 rounded-xl border border-green-200 dark:border-green-800 p-6 shadow-lg">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircleIcon className="w-6 h-6 text-green-500" />
                  <h4 className="font-bold text-lg text-green-800 dark:text-green-300">🎬 发布成功！您的电影已上线</h4>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                  创作者：<b>@{user?.nickname || '我'}</b> · 作品已登上「最新上架 AI 短剧」最前排
                </p>

                {publishResult.playUrl ? (
                  publishResult.playUrl.includes('.m3u8') ? (
                    <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-4 mb-4 text-sm text-gray-600 dark:text-gray-300">
                      📡 已生成 <b>HLS 自适应流（.m3u8）</b>，请点击下方按钮在前台播放器中观看。
                    </div>
                  ) : (
                    <div className="relative rounded-xl overflow-hidden bg-black mb-4">
                      <video src={publishResult.playUrl} controls playsInline preload="metadata" className="w-full max-h-[300px]" />
                    </div>
                  )
                ) : (
                  <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-4 mb-4 text-sm text-gray-500">播放地址生成中，请前往前台观看。</div>
                )}

                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">电影 ID</p>
                    <p className="font-mono font-semibold text-gray-800 dark:text-gray-200">#{publishResult.postId}</p>
                  </div>
                  <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">腾讯云 FileId</p>
                    <p className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{publishResult.fileId || '—'}</p>
                  </div>
                </div>

                {warnings.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3 mb-4">
                    {warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>
                    ))}
                  </div>
                )}

                <div className="flex gap-3">
                  <a
                    href={publishResult.frontLink || publishResult.wpLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all text-center font-medium text-sm flex items-center justify-center gap-2 shadow-md"
                  >
                    <LinkIcon className="w-4 h-4" /> 前往前台观看
                  </a>
                  <button
                    type="button"
                    onClick={resetPipeline}
                    className="flex-1 py-2.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all text-center font-medium text-sm flex items-center justify-center gap-2"
                  >
                    <SparklesIcon className="w-4 h-4" /> 再生成一部
                  </button>
                </div>
              </div>
            )}

            {/* 错误卡片 */}
            {stage === 'error' && errorMsg && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="w-6 h-6 text-red-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-red-700 dark:text-red-300 mb-1">流水线中断</p>
                    <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
                    {errorCode && <p className="mt-2 text-xs text-red-500 font-mono">错误码：{errorCode}</p>}
                    {errorRequestId && <p className="text-xs text-red-400 font-mono break-all">RequestId：{errorRequestId}</p>}
                    <p className="text-xs text-red-500 mt-2">如为扣费类失败，系统已自动退回 Credits；您可修改提示词后重试。</p>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    type="button"
                    onClick={resetPipeline}
                    className="flex-1 py-2.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all text-sm font-medium"
                  >
                    重试
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all text-sm font-medium"
                  >
                    关闭
                  </button>
                </div>
              </div>
            )}

            {/* 空闲时流水线说明 */}
            {user && !needsRecharge && stage === 'idle' && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">🌐 全球顶级 24 小时无休流水线</p>
                <PipelineProgress statuses={['pending', 'pending', 'pending', 'pending']} />
                <p className="text-xs text-gray-400 mt-4 leading-relaxed">
                  输入描述词后点击「一键生成并全球发布」：DeepSeek 优化 → AI 生成 → 腾讯云 VOD 转码 →
                  WordPress 自动上架 → 全球 CDN 分发，全程无需人工干预；生成或上架失败将自动退回 Credits。
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ---------- Bottom Bar ---------- */}
        <div className="p-4 border-t dark:border-gray-700 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900 dark:to-gray-850">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {isRunning
                ? '⏳ 流水线运行中，预计耗时 15 秒 ~ 3 分钟，请勿关闭窗口'
                : stage === 'done'
                  ? '✅ 流水线执行完毕 · 电影已上架至全球 CDN'
                  : '🎬 AI 生成 → 腾讯云 VOD → 自动发布 → 全球极速播放'}
            </p>
            <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
              <GlobeAltIcon className="w-3 h-3" /> 24h 无休
            </span>
          </div>
        </div>
      </div>

      {/* 刷脸注册/登录弹窗（唯一注册方式，腾讯云基础人脸核身） */}
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
