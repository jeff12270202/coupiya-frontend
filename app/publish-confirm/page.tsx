'use client';

// ============================================================================
// app/publish-confirm/page.tsx —— 发布确认页（极客空间终端链接的落点）
// ----------------------------------------------------------------------------
// 链路（SOP 39/41）：Cloud Studio 的 main.py 生成视频并上传 COS 后，在终端打印
//   https://coupiya.com/publish-confirm?video_url=...&title=...&user_id=...
// 用户单击链接 → 本页自动提取参数、回填表单（视频预览 + 标题）→
// 点击「确认发布到全球电影墙」→ POST /api/ai/publish-vod-movie
// （鉴权→扣费→VOD 转码→写 WordPress，含 author_user_id）→ 电影墙瞬间更新。
//
// 安全要点：
//   1. 身份以【登录会话】为准，URL 里的 user_id 仅作展示参考、绝不信
//      （伪造 user_id 无法冒名上墙；服务端 resolveUserId 只认会话/令牌）
//   2. video_url 白名单：仅 http(s) 且长度受限，防注入
//   3. 诚实契约：失败显示错误码 + requestId，绝不 fake 成功
// ============================================================================

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  FilmIcon,
  GlobeAltIcon,
  LinkIcon,
  RocketLaunchIcon,
  WalletIcon,
} from '@heroicons/react/24/outline';
import FaceAuthModal from '@/components/FaceAuthModal';
import { useAuth } from '@/hooks/useAuth';

/* ============================================================================
 * 一、常量与工具
 * ========================================================================= */

const PUBLISH_COST_CREDITS = 20; // 与 publish-vod-movie 的 PUBLISH_COST_CREDITS 默认值一致
const TITLE_MAX = 120; // 与后端 maxTitleChars 一致
const URL_MAX = 2000; // 与后端 maxUrlChars 一致
const PUBLISH_TIMEOUT_MS = 290_000; // 发布含 VOD 转码轮询，最多 ~5 分钟

type Stage = 'idle' | 'submitting' | 'done' | 'error';

interface PublishOk {
  postId: number;
  slug: string;
  wpLink: string;
  playUrl: string;
  fileId: string;
}

function friendlyError(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'INSUFFICIENT_BALANCE':
      return '余额不足，请先充值后再发布';
    case 'ERR_AUTH':
      return '登录状态已失效，请重新刷脸登录';
    case 'ERR_RATE_LIMITED':
      return '操作过于频繁，请稍后再试';
    case 'ERR_VOD':
      return '视频转码失败，本次费用已自动退回';
    case 'ERR_WORDPRESS':
      return '上架失败，本次费用已自动退回';
    case 'ERR_UPSTREAM':
      return '视频处理服务暂不可用，本次费用已自动退回';
    default:
      return fallback || '发布失败，请稍后重试';
  }
}

function validateVideoUrl(raw: string | null): string {
  const value = (raw ?? '').trim().slice(0, URL_MAX);
  if (!value) return '';
  if (!/^https?:\/\//.test(value)) return '';
  return value;
}

/* ============================================================================
 * 二、主内容（客户端）
 * ========================================================================= */

function PublishConfirmInner() {
  const sp = useSearchParams();
  const { user, loading: authLoading, refresh, setUser } = useAuth();

  // 参数提取（一次性；URL 变化不覆盖用户已编辑内容）
  const [videoUrl] = useState<string>(() => validateVideoUrl(sp.get('video_url') ?? sp.get('url')));
  const [title, setTitle] = useState<string>(() => {
    const raw = (sp.get('title') ?? '').trim().slice(0, TITLE_MAX);
    return raw || '我的 AI 电影';
  });

  const [stage, setStage] = useState<Stage>('idle');
  const [result, setResult] = useState<PublishOk | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [errorRequestId, setErrorRequestId] = useState<string | undefined>();
  const [showFaceAuth, setShowFaceAuth] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const linkInvalid = !videoUrl;
  const needsFaceAuth = !authLoading && !user;
  const needsRecharge = !authLoading && !!user && user.balance <= 0;

  // 卸载时中止请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  /* ---- 确认发布（真实接口，诚实状态） ---- */
  const publish = useCallback(async () => {
    if (!user || stage === 'submitting' || linkInvalid) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), PUBLISH_TIMEOUT_MS);

    setStage('submitting');
    setErrorMsg('');
    setErrorCode(undefined);
    setErrorRequestId(undefined);
    setResult(null);

    try {
      const res = await fetch('/api/ai/publish-vod-movie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-coupiya-user-id': String(user.id) },
        body: JSON.stringify({
          video_url: videoUrl,
          title: title.trim().slice(0, TITLE_MAX) || '我的 AI 电影',
          source: 'geek',
        }),
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => null)) as
        | ({ success?: boolean; postId?: number; movie?: Record<string, unknown> } & {
            code?: string;
            message?: string;
            requestId?: string;
          })
        | null;

      if (!res.ok || !data?.success || !data?.postId) {
        const message = data?.message || `发布失败（HTTP ${res.status}）`;
        const e = new Error(message) as Error & { code?: string; requestId?: string };
        e.code = data?.code;
        e.requestId = data?.requestId;
        throw e;
      }

      const m = data.movie ?? {};
      setResult({
        postId: Number(data.postId),
        slug: String(m.slug ?? ''),
        wpLink: String(m.link ?? ''),
        playUrl: String(m.playUrl ?? ''),
        fileId: String(m.fileId ?? ''),
      });
      setStage('done');
      void refresh(); // 同步余额
    } catch (e) {
      const err = e as Error & { code?: string; requestId?: string };
      setErrorMsg(err.name === 'AbortError' ? '发布超时，请稍后重试' : friendlyError(err.code, err.message));
      setErrorCode(err.code);
      setErrorRequestId(err.requestId);
      setStage('error');
    } finally {
      clearTimeout(timer);
      abortRef.current = null;
    }
  }, [user, stage, linkInvalid, videoUrl, title, refresh]);

  const frontLink = result?.slug
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/movie/${encodeURIComponent(result.slug)}`
    : result?.wpLink || '';

  /* ---- 渲染 ---- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-purple-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* 页头 */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg">
            <span className="text-white text-xl">🎬</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {stage === 'done' ? '🎉 发布成功！' : '发布到全球电影墙'}
            </h1>
            <p className="text-sm text-gray-500">极速AI极客创作空间 · 一键确认上架</p>
          </div>
        </div>

        {authLoading ? (
          <div className="bg-white rounded-2xl shadow-md p-8 text-center text-gray-500">正在校验登录状态…</div>
        ) : needsFaceAuth ? (
          /* 闸门①：刷脸登录（发布是创作闭环，必须登录） */
          <div className="bg-white rounded-2xl shadow-md p-10 text-center">
            <div className="text-5xl mb-4">🪪</div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">发布前需刷脸登录</h2>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              您的作品将以您的网站账号名义上墙（无需腾讯云账号）。
            </p>
            <button
              type="button"
              onClick={() => setShowFaceAuth(true)}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              开始刷脸 · 登录 / 注册
            </button>
          </div>
        ) : linkInvalid ? (
          /* 链接无效（无 video_url 或非 http(s)） */
          <div className="bg-white rounded-2xl shadow-md p-10 text-center">
            <ExclamationTriangleIcon className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-800 mb-2">链接无效</h2>
            <p className="text-sm text-gray-500 mb-6">
              缺少有效的视频地址参数。请从 Cloud Studio 终端中点击官方生成的发布链接进入本页。
            </p>
            <Link
              href="/blog"
              className="inline-block px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold shadow-lg hover:scale-[1.02] transition-transform"
            >
              回到电影墙
            </Link>
          </div>
        ) : needsRecharge ? (
          /* 闸门②：余额不足 */
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl shadow-md p-10 text-center border border-amber-200">
            <div className="text-5xl mb-4">💰</div>
            <h2 className="text-lg font-bold text-amber-800 mb-2">余额不足，请先充值</h2>
            <p className="text-sm text-amber-700 mb-6">
              当前余额 <b>0 Credits</b> · 发布一部作品需 <b>{PUBLISH_COST_CREDITS} Credits</b>
            </p>
            <Link
              href="/recharge"
              className="block w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold shadow-lg transition-all text-center"
            >
              立即充值 Credits
            </Link>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-3 w-full py-2.5 rounded-xl border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors text-sm"
            >
              已充值？刷新余额
            </button>
          </div>
        ) : (
          /* 正常：预览 + 确认表单 */
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
            {/* 视频预览 */}
            <div className="bg-black aspect-video flex items-center justify-center">
              {videoUrl ? (
                videoUrl.includes('.m3u8') ? (
                  <div className="text-center text-gray-300 px-6">
                    <FilmIcon className="w-12 h-12 mx-auto mb-3 opacity-60" />
                    <p className="text-sm">已生成 HLS 自适应流（.m3u8）</p>
                    <p className="text-xs text-gray-500 mt-1 break-all">{videoUrl.slice(0, 120)}…</p>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <video src={videoUrl} controls playsInline preload="metadata" className="w-full h-full max-h-[320px]" />
                )
              ) : (
                <p className="text-gray-400">视频预览不可用</p>
              )}
            </div>

            <div className="p-6 space-y-5">
              {/* 归属说明（身份以会话为准，URL 里的 user_id 不信任） */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  作品归属：<b className="text-purple-600">@{user?.nickname || '创作者'}</b>
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                  <WalletIcon className="w-3.5 h-3.5" />
                  余额 {user?.balance ?? 0} Credits
                </span>
              </div>

              {/* 标题（自动回填，可微调） */}
              <div>
                <label htmlFor="movie-title" className="block text-sm font-medium text-gray-700 mb-2">
                  🏷️ 作品标题
                </label>
                <input
                  id="movie-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={TITLE_MAX}
                  disabled={stage === 'submitting'}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                />
                <p className="mt-1 text-right text-xs text-gray-400">{title.length}/{TITLE_MAX}</p>
              </div>

              {/* 费用说明 */}
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 flex items-center justify-between">
                <span>发布费用（VOD 转码 + 上架）</span>
                <b className="text-purple-600">{PUBLISH_COST_CREDITS} Credits</b>
              </div>

              {/* 确认按钮 */}
              <button
                type="button"
                onClick={() => void publish()}
                disabled={stage === 'submitting'}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {stage === 'submitting' ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    正在转码并上架…
                  </>
                ) : (
                  <>
                    <RocketLaunchIcon className="w-6 h-6" /> 确认发布到全球电影墙
                  </>
                )}
              </button>
              <p className="text-center text-xs text-gray-400">
                发布后可在 <Link href="/blog" className="text-purple-500 hover:underline">WE ARE THE WORLD AI 影视</Link> 最前排看到您的作品 · 失败自动退回 Credits
              </p>

              {/* 错误 */}
              {stage === 'error' && errorMsg && (
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

              {/* 成功 */}
              {stage === 'done' && result && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircleIcon className="w-6 h-6 text-green-500" />
                    <h3 className="font-bold text-green-800">🎬 您的电影已上架全球电影墙！</h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    创作者：<b>@{user?.nickname || '我'}</b> · 电影 ID <b>#{result.postId}</b>
                    {result.fileId ? ` · 腾讯云 FileId ${result.fileId.slice(0, 12)}…` : ''}
                  </p>
                  <div className="flex gap-3">
                    {frontLink && (
                      <a
                        href={frontLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-3 rounded-xl bg-green-500 text-white font-semibold shadow-md hover:bg-green-600 transition-colors text-center flex items-center justify-center gap-2"
                      >
                        <LinkIcon className="w-4 h-4" /> 前往前台观看
                      </a>
                    )}
                    <Link
                      href="/blog"
                      className="flex-1 py-3 rounded-xl bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors text-center font-semibold"
                    >
                      回到电影墙
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 页脚 */}
        <p className="mt-8 text-center text-xs text-gray-400 flex items-center justify-center gap-1">
          <GlobeAltIcon className="w-3 h-3" /> 全球 CDN 极速分发 · 24h 无休 · 生成与发布失败自动退款
        </p>
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

export default function PublishConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-500">
          <span className="w-6 h-6 border-2 border-purple-300 border-t-purple-500 rounded-full animate-spin" />
          <span className="ml-3">正在加载发布确认页…</span>
        </div>
      }
    >
      <PublishConfirmInner />
    </Suspense>
  );
}
