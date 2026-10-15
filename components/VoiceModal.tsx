'use client';

/**
 * VoiceModal —— 全站 AI 语音助手（语音寻瓷 · 全球完全开放）
 * ============================================================================
 * 产品规则（用户澄清版）：
 *   - 全站浏览/使用完全开放，本助手【不设登录墙、不扣费】；
 *   - 仅「AI 视频生成」「极速AI极客创作空间」两个创作入口才需要刷脸 + 余额。
 *
 * 后端契约（与 app/api/ai/voice/route.ts 对齐）：
 *   POST /api/ai/voice
 *     Body: { command: string, type?: string, lang?: string }
 *     200:    { success: true, reply: string, requestId?: string }
 *     4xx/5xx:{ success: false, code, message, requestId }
 *             code: ERR_VALIDATION / ERR_RATE_LIMITED / ERR_UPSTREAM ...
 *
 * 设计要点：
 *   1. 生产 fail-closed：绝不使用关键词 canned 回复冒充 AI 结果；
 *      接口失败一律显示诚实错误 + 错误码 + requestId（供客服排障）
 *   2. 麦克风生命周期管理：组件卸载/关闭时自动 stop 识别并 abort 进行中的请求
 *   3. 请求超时 + AbortController；忙碌态防重复触发
 *   4. 语言下拉为真实控件（动态设置 recognition.lang 并随请求发送）
 *   5. role="dialog" / Esc 关闭 / aria 无障碍
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExclamationTriangleIcon, MicrophoneIcon, StopIcon, XMarkIcon } from '@heroicons/react/24/outline';

/* ============================================================================
 * 一、类型与常量
 * ========================================================================= */

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface VoiceApiError {
  code?: string;
  message?: string;
  requestId?: string;
}

/** 请求超时：语音问答为轻量接口，20 秒足够 */
const VOICE_TIMEOUT_MS = 20_000;
const VOICE_TYPE = 'shopping'; // 场景标识（与后端契约一致）
const COMMAND_MAX = 500; // 与后端上限一致

const LANG_OPTIONS: { value: string; label: string }[] = [
  { value: 'zh-CN', label: '中文 (普通话)' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
];

const EXAMPLE_COMMANDS = ['搜索陶瓷饰品', '查看购物车', '推荐商品', '我的订单', '帮助'];

/* ============================================================================
 * 二、主组件
 * ========================================================================= */

export default function VoiceModal({ onClose }: { onClose: () => void }) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [errorRequestId, setErrorRequestId] = useState<string | undefined>();
  const [lang, setLang] = useState('zh-CN');

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const busy = isListening || isProcessing;

  /* ---- 初始化语音识别（仅一次） ---- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = lang;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results?.[0]?.[0];
      if (!result?.transcript) return;
      const text = result.transcript;
      setTranscript(text);
      void processVoiceCommand(text);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setErrorMsg('无法识别语音，请检查麦克风权限后重试');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    // 卸载清理：停止识别 + 中止进行中的请求
    return () => {
      try {
        recognition.abort();
      } catch {
        /* 忽略 */
      }
      recognitionRef.current = null;
      abortRef.current?.abort();
      abortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- 语言切换：同步识别器 ---- */
  useEffect(() => {
    if (recognitionRef.current) recognitionRef.current.lang = lang;
  }, [lang]);

  /* ---- Esc 关闭 + 锁定页面滚动 ---- */
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  /* ---- 核心：发送语音指令到 AI 助手（fail-closed） ---- */
  const processVoiceCommand = useCallback(async (command: string) => {
    const trimmed = command.trim().slice(0, COMMAND_MAX);
    if (!trimmed || isProcessing) return;

    setIsProcessing(true);
    setResponse('');
    setErrorMsg('');
    setErrorCode(undefined);
    setErrorRequestId(undefined);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), VOICE_TIMEOUT_MS);

    try {
      const res = await fetch('/api/ai/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed, type: VOICE_TYPE, lang }),
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => null)) as
        | ({ success?: boolean; reply?: string; message?: string } & VoiceApiError)
        | null;

      if (!res.ok || !data) {
        const message = (data?.message as string) || `请求失败（HTTP ${res.status}）`;
        const code = (data?.code as string) || undefined;
        const requestId = (data?.requestId as string) || undefined;
        const err = new Error(message) as Error & VoiceApiError;
        err.code = code;
        err.requestId = requestId;
        throw err;
      }

      const reply = (data.reply as string) || (data.message as string) || '';
      if (!reply) {
        throw Object.assign(new Error('助手未返回内容，请稍后重试'), { code: 'ERR_EMPTY_REPLY' });
      }
      setResponse(reply);
    } catch (e) {
      const err = e as Error & VoiceApiError;
      setErrorMsg(err.name === 'AbortError' ? '请求超时，请稍后重试' : err.message || '语音服务暂时不可用');
      setErrorCode(err.code);
      setErrorRequestId(err.requestId);
    } finally {
      clearTimeout(timer);
      abortRef.current = null;
      setIsProcessing(false);
    }
  }, [isProcessing, lang]);

  /* ---- 开始聆听 ---- */
  const startListening = useCallback(() => {
    if (isProcessing) return;
    const recognition = recognitionRef.current;
    if (!recognition) {
      setErrorMsg('您的浏览器不支持语音识别，请使用 Chrome / Edge 等现代浏览器');
      return;
    }
    setTranscript('');
    setResponse('');
    setErrorMsg('');
    setErrorCode(undefined);
    setErrorRequestId(undefined);
    try {
      recognition.lang = lang;
      recognition.start();
      setIsListening(true);
    } catch {
      // 已在识别中或浏览器拒绝
      setErrorMsg('无法启动麦克风，请检查权限或稍后重试');
      setIsListening(false);
    }
  }, [isProcessing, lang]);

  /* ---- 停止聆听 ---- */
  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* 忽略 */
    }
    setIsListening(false);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="AI 语音助手"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---------- Header ---------- */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center">
              <span className="text-white text-xl">🎙️</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">语音寻瓷</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">AI 语音助手 · 全站开放免登录</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* ---------- Main Content ---------- */}
        <div className="flex-1 overflow-y-auto p-8 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
          <div className="max-w-md mx-auto text-center" aria-live="polite">
            {/* 麦克风按钮 */}
            <div className="mb-8">
              <div
                className={`w-32 h-32 mx-auto rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 ${
                  isListening
                    ? 'bg-red-500 animate-pulse scale-110 shadow-2xl shadow-red-500/50'
                    : isProcessing
                      ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-orange-500 to-red-500 hover:scale-105 shadow-lg hover:shadow-xl'
                }`}
                role="button"
                aria-label={isListening ? '停止聆听' : '开始语音输入'}
                onClick={isProcessing ? undefined : isListening ? stopListening : startListening}
              >
                {isListening ? (
                  <StopIcon className="w-12 h-12 text-white" />
                ) : (
                  <MicrophoneIcon className="w-12 h-12 text-white" />
                )}
              </div>
              <p className="mt-4 text-gray-600 dark:text-gray-400 font-medium">
                {isProcessing
                  ? 'AI 助手思考中…'
                  : isListening
                    ? '正在聆听…'
                    : '点击麦克风开始语音输入'}
              </p>
            </div>

            {/* 您说 */}
            {transcript && (
              <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-xl">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">您说：</p>
                <p className="text-gray-900 dark:text-white font-medium break-words">{transcript}</p>
              </div>
            )}

            {/* 助手回复（真实接口结果） */}
            {response && (
              <div className="mb-6 p-4 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
                <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">助手回复：</p>
                <p className="text-gray-900 dark:text-white whitespace-pre-wrap break-words">{response}</p>
              </div>
            )}

            {/* 错误（诚实契约，绝不 canned 冒充） */}
            {errorMsg && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl text-left">
                <div className="flex items-start gap-2">
                  <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-red-700 dark:text-red-300">{errorMsg}</p>
                    {errorCode && <p className="mt-1 text-xs text-red-500 font-mono">错误码：{errorCode}</p>}
                    {errorRequestId && <p className="text-xs text-red-400 font-mono break-all">RequestId：{errorRequestId}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* 处理中 */}
            {isProcessing && (
              <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500" />
                <span>处理中…</span>
              </div>
            )}

            {/* 示例指令（真实指令，发送给 AI 助手，非 canned） */}
            <div className="mt-8">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">试试这样说：</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {EXAMPLE_COMMANDS.map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setTranscript(cmd);
                      void processVoiceCommand(cmd);
                    }}
                    className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ---------- Bottom Bar（语言为真实控件） ---------- */}
        <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="max-w-md mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="voice-lang" className="sr-only">
                识别语言
              </label>
              <select
                id="voice-lang"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                disabled={isListening || isProcessing}
                className="text-xs bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
              >
                {LANG_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">🎤 支持中 / 英 / 日语音识别</p>
          </div>
        </div>
      </div>
    </div>
  );
}
