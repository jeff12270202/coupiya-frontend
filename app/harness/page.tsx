'use client';

// ============================================================================
// app/harness/page.tsx —— HARNESS 运行时主梁工作台（独立跳窗）
// ----------------------------------------------------------------------------
// 使用方式（三处入口都会调它）：
//   window.open('/harness', 'coupiya-harness', 'width=1280,height=880,noopener')
//   · 瓷韵 AI 助手浮窗 → 「Harness 深度任务」
//   · 星链接入口 → 任务弹窗 / 底栏「AI 任务」的用户可选择走主梁
//   · 任意页面直接访问 /harness
//
// 为什么它必须是一个【独立窗口】而不是又一个 modal：
//   工程图纸 / 复杂代码这类任务的执行时间是分钟级的，用户需要一边看轨迹一边
//   继续浏览店铺。塞进 modal 会把主页面锁死；独立窗口才能真正"并行"。
//
// 页面骨架 = Harness 本身（这是需求的原话："整个版面以 harness 为主梁骨"）：
//   ① 主梁状态栏 —— Worker 是否已连接（未连接就明说，并给部署指引）
//   ② 任务接入  —— 三种入口的网页形态：高精尖任务表单 + 附件 + 模型
//   ③ 执行轨迹  —— Harness 会话日志派生的 trajectory，逐步展示（执行透明化）
//   ④ 插件矩阵  —— 20 个插件的真实落地状态（live / partial / planned）
//   ⑤ 战略定位  —— 星链的死穴与大模型的关系，说清楚我们到底在卖什么
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  BoltIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  CloudArrowUpIcon,
  CpuChipIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  PaperAirplaneIcon,
  PuzzlePieceIcon,
  RocketLaunchIcon,
  ServerStackIcon,
  SignalSlashIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

/* ---------------- 类型（与 lib/harness.ts 的契约一一对应） ---------------- */

interface HarnessPlugin {
  no: number;
  name: string;
  group: string;
  status: 'live' | 'partial' | 'planned';
  evidence: string;
}

interface HarnessStatus {
  configured: boolean;
  workerUrlMasked: string;
  hasToken: boolean;
  mode: string;
  plugins: HarnessPlugin[];
  pluginSummary: { total: number; live: number; partial: number; planned: number };
  models: Array<{ id: string; label: string; tier: string; desc: string }>;
  defaultModel: string;
  guidance: string;
}

interface TrajectoryStep {
  ts: string;
  step: string;
  detail: string;
  level?: 'info' | 'warn' | 'error';
}

interface Attachment {
  type: 'image' | 'document';
  base64?: string;
  text?: string;
  fileName: string;
}

const CATEGORIES = [
  '工程图纸解读',
  '复杂代码生成',
  '系统架构设计',
  '方案策划',
  '数据报表整理',
  '法律 / 合同审查',
  '其他高精尖任务',
] as const;

const MAX_FILE_BYTES = 3 * 1024 * 1024; // 与 /api/ai/chat 的 maxImageBase64Chars 口径一致

const STATUS_META: Record<HarnessPlugin['status'], { label: string; cls: string; dot: string }> = {
  live: { label: '已落地', cls: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30', dot: 'bg-emerald-400' },
  partial: { label: '部分可用', cls: 'bg-amber-500/15 text-amber-200 border-amber-400/30', dot: 'bg-amber-400' },
  planned: { label: '规划中', cls: 'bg-white/10 text-white/55 border-white/15', dot: 'bg-white/30' },
};

export default function HarnessPage() {
  const [status, setStatus] = useState<HarnessStatus | null>(null);
  const [statusError, setStatusError] = useState('');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const [running, setRunning] = useState(false);
  const [reply, setReply] = useState('');
  const [trajectory, setTrajectory] = useState<TrajectoryStep[]>([]);
  const [error, setError] = useState('');
  const [fallbackNote, setFallbackNote] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const logRef = useRef<HTMLDivElement | null>(null);
  const startedAt = useRef<number>(0);

  /* ---- 拉取主梁状态 ---- */
  const loadStatus = useCallback(async () => {
    setStatusError('');
    try {
      const res = await fetch('/api/ai/harness', { cache: 'no-store' });
      const data = (await res.json()) as HarnessStatus;
      setStatus(data);
      setModel((m) => m || data.defaultModel || '');
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : '主梁状态获取失败');
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  /* ---- 运行计时器：让"慢"变得可解释，而不是一个无意义的转圈 ---- */
  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now();
    setElapsed(0);
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [trajectory]);

  const pushStep = useCallback((step: string, detail: string, level: TrajectoryStep['level'] = 'info') => {
    setTrajectory((prev) => [...prev, { ts: new Date().toLocaleTimeString('zh-CN'), step, detail, level }]);
  }, []);

  const canSubmit = title.trim().length > 0 && prompt.trim().length > 0 && !running;

  const summary = status?.pluginSummary ?? { total: 20, live: 0, partial: 0, planned: 20 };

  const selectedModelSpec = useMemo(
    () => status?.models.find((m) => m.id === model),
    [status, model],
  );

  /* ---- 读取附件为 base64（图片）或纯文本（文档）---- */
  const readAttachment = useCallback(async (file: File): Promise<Attachment | null> => {
    const isImage = file.type.startsWith('image/');
    const isText = file.type === 'text/plain';
    const isPdf = file.type === 'application/pdf';
    const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    if (isImage) {
      if (file.size > MAX_FILE_BYTES) throw new Error(`图片「${file.name}」超过 3MB，请压缩后再传`);
      const buf = await file.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
      return { type: 'image', base64: btoa(binary), fileName: file.name };
    }
    if (isText) {
      return { type: 'document', text: (await file.text()).slice(0, 20_000), fileName: file.name };
    }
    if (isPdf || isDocx) {
      // PDF/DOCX 的解析在服务端做（/api/ai/chat 已具备），这里只登记文件名，
      // 让 Worker 知道"有这份资料"，由服务端按需抓取。绝不在这里假装读到了内容。
      return { type: 'document', fileName: file.name, text: `（${file.name}：二进制文档，交由服务端解析）` };
    }
    return null;
  }, []);

  /* ---- 提交 ---- */
  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setRunning(true);
    setReply('');
    setError('');
    setFallbackNote('');
    setTrajectory([]);

    try {
      pushStep('接收任务', `${category} · ${files.length} 个附件`);

      const attachments: Attachment[] = [];
      if (files.length > 0) {
        pushStep('预处理附件', `正在读取 ${files.length} 个文件…`);
        for (const f of files) {
          const a = await readAttachment(f);
          if (a) attachments.push(a);
        }
        pushStep('预处理附件', `已就绪 ${attachments.length} 个（图片转 base64 / 文本文档内联 / 二进制交由服务端）`);
      }

      pushStep('调用 Harness 主梁', `${status?.configured ? 'Serverless Worker' : '未配置 → 回退标准通道'} · 模型 ${selectedModelSpec?.label ?? model}`);

      const res = await fetch('/api/ai/harness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          category,
          prompt: prompt.trim(),
          model,
          attachments,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        reply?: string;
        model_used?: string;
        trajectory?: TrajectoryStep[];
        code?: string;
        message?: string;
        deployHint?: string;
        fallback?: string;
      };

      /* ---- Worker 未部署：诚实回退到标准通道，并明确告知用户走的是哪条路 ---- */
      if (res.status === 501 && data.code === 'ERR_HARNESS_NOT_CONFIGURED') {
        pushStep('主梁未就绪', data.message ?? 'Worker 未配置', 'warn');
        setFallbackNote(
          `Harness Worker 尚未部署（${data.message ?? ''}）。已自动改用标准对话通道执行本次任务 —— 它能很好地处理文本类高精尖任务，但**不包含代码沙箱、图纸解析等重工具链**。${data.deployHint ?? ''}`,
        );
        pushStep('回退标准通道', 'POST /api/ai/chat');

        const fb = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `【${category}】${title.trim()}\n\n${prompt.trim()}`,
            model,
            attachments,
          }),
        });
        const fbData = (await fb.json().catch(() => ({}))) as { success?: boolean; reply?: string; model_used?: string; message?: string };
        if (!fb.ok || !fbData.reply) {
          throw new Error(fbData.message || `标准通道也失败（HTTP ${fb.status}）`);
        }
        setReply(fbData.reply);
        pushStep('完成', `实际模型：${fbData.model_used ?? model}`, 'info');
        return;
      }

      if (!res.ok || data.success === false || !data.reply) {
        throw new Error(data.message || `主梁执行失败（HTTP ${res.status}）`);
      }

      if (Array.isArray(data.trajectory)) {
        for (const s of data.trajectory) {
          setTrajectory((prev) => [...prev, { ...s, ts: s.ts || new Date().toLocaleTimeString('zh-CN') }]);
        }
      }
      setReply(data.reply);
      pushStep('完成', `实际模型：${data.model_used ?? model}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '任务执行失败';
      setError(msg);
      pushStep('失败', msg, 'error');
    } finally {
      setRunning(false);
    }
  }, [canSubmit, category, files, model, prompt, pushStep, readAttachment, selectedModelSpec, status?.configured, title]);

  /* ==========================================================================
   * 渲染
   * ======================================================================== */
  return (
    <div className="min-h-screen bg-[#050a20] text-white">
      {/* ===== ① 主梁状态栏 ===== */}
      <header className="border-b border-white/10 bg-gradient-to-r from-indigo-950 via-slate-950 to-slate-900">
        <div className="container mx-auto px-5 py-4 max-w-7xl">
          <div className="flex items-center gap-3 flex-wrap">
            <ServerStackIcon className="w-7 h-7 text-cyan-300" />
            <h1 className="text-xl font-bold tracking-wide">
              HARNESS <span className="text-cyan-300">运行时主梁</span>
            </h1>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-200 border border-cyan-400/30">
              方案 A · Serverless Worker
            </span>
            <button
              type="button"
              onClick={() => void loadStatus()}
              className="ml-auto text-xs text-white/60 hover:text-cyan-300 inline-flex items-center gap-1"
            >
              <ArrowPathIcon className="w-3.5 h-3.5" /> 刷新状态
            </button>
          </div>

          <div
            className={`mt-3 rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${
              status?.configured
                ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-100'
                : 'bg-amber-500/10 border-amber-400/30 text-amber-100'
            }`}
          >
            {status?.configured ? <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />}
            <div className="leading-relaxed">
              <p className="font-semibold">{status?.configured ? '主梁已连接' : '主梁未连接（Worker 尚未部署）'}</p>
              <p className="text-xs mt-0.5 opacity-90">{status?.guidance ?? statusError ?? '正在探测…'}</p>
              {status?.configured && (
                <p className="text-xs mt-1 opacity-70 font-mono">
                  {status.workerUrlMasked} · token {status.hasToken ? '已配置' : '未配置（Worker 可能拒绝鉴权）'}
                </p>
              )}
            </div>
          </div>

          {/* 插件总览 */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {[
              { k: '插件总数', v: summary.total, c: 'text-white' },
              { k: '已落地', v: summary.live, c: 'text-emerald-300' },
              { k: '部分可用', v: summary.partial, c: 'text-amber-300' },
              { k: '规划中', v: summary.planned, c: 'text-white/50' },
            ].map((s) => (
              <div key={s.k} className="rounded-lg bg-white/5 border border-white/10 py-2">
                <p className={`text-xl font-bold font-mono ${s.c}`}>{s.v}</p>
                <p className="text-[11px] text-white/50">{s.k}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-5 py-6 max-w-7xl">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6">
          {/* ===================== 左列：任务接入 + 执行轨迹 ===================== */}
          <div className="space-y-6">
            {/* ② 任务接入 */}
            <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5">
              <h2 className="font-bold flex items-center gap-2 mb-4">
                <RocketLaunchIcon className="w-5 h-5 text-cyan-300" /> 高精尖任务接入
              </h2>

              <div className="grid sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1.5" htmlFor="hx-title">
                    任务标题 <span className="text-red-300">*</span>
                  </label>
                  <input
                    id="hx-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例如：解读这张钢结构厂房图纸并出材料清单"
                    className="w-full rounded-xl px-3 py-2.5 bg-white/10 border border-white/20 text-sm placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1.5" htmlFor="hx-cat">
                    任务类型
                  </label>
                  <select
                    id="hx-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 bg-white/10 border border-white/20 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c} className="bg-[#050a20]">
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="block text-xs text-white/60 mb-1.5" htmlFor="hx-prompt">
                任务描述 <span className="text-red-300">*</span>
              </label>
              <textarea
                id="hx-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                placeholder="把要求写清楚：图纸要算什么量、代码用什么语言什么框架、交付物是什么格式…"
                className="w-full rounded-xl px-3 py-2.5 bg-white/10 border border-white/20 text-sm resize-y placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />

              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1.5">参考附件（最多 8 个）</label>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 8))}
                    className="w-full text-xs text-white/75 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-cyan-600 file:text-white file:font-semibold hover:file:brightness-110"
                  />
                  {files.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-[11px] text-white/55">
                      {files.map((f) => (
                        <li key={f.name} className="flex items-center gap-1.5">
                          <CloudArrowUpIcon className="w-3.5 h-3.5 text-cyan-300" />
                          {f.name} · {(f.size / 1024).toFixed(0)} KB
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1.5" htmlFor="hx-model">
                    执行模型
                  </label>
                  <select
                    id="hx-model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 bg-white/10 border border-white/20 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  >
                    {(status?.models ?? []).map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#050a20]">
                        {m.label}
                      </option>
                    ))}
                  </select>
                  {selectedModelSpec && <p className="text-[11px] text-white/45 mt-1.5">{selectedModelSpec.desc}</p>}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => void submit()}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {running ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <PaperAirplaneIcon className="w-4 h-4" />}
                  {running ? `主梁执行中 · ${elapsed}s` : '提交到 Harness 主梁'}
                </button>
                {running && (
                  <span className="text-xs text-white/55 flex items-center gap-1.5">
                    <ClockIcon className="w-3.5 h-3.5" />
                    Serverless 冷启动约 2-5 秒；工程图纸类任务通常在 1-3 分钟
                  </span>
                )}
              </div>
            </section>

            {/* ③ 执行轨迹 */}
            <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5">
              <h2 className="font-bold flex items-center gap-2 mb-3">
                <BoltIcon className="w-5 h-5 text-amber-300" /> 执行轨迹（Trajectory）
                <span className="text-[11px] font-normal text-white/45 ml-auto">来自 Harness 会话日志的追加式事件流</span>
              </h2>

              <div ref={logRef} className="max-h-64 overflow-y-auto rounded-xl bg-black/40 border border-white/10 p-3 font-mono text-[11px] leading-relaxed">
                {trajectory.length === 0 ? (
                  <p className="text-white/35">尚无执行记录。提交任务后，每一步都会实时出现在这里 —— 不是"处理中"转圈，而是真正的执行透明化。</p>
                ) : (
                  trajectory.map((s, i) => (
                    <div key={`${s.ts}-${i}`} className="flex gap-2 py-0.5">
                      <span className="text-white/35 flex-shrink-0">{s.ts}</span>
                      <span
                        className={`flex-shrink-0 ${
                          s.level === 'error' ? 'text-red-300' : s.level === 'warn' ? 'text-amber-300' : 'text-cyan-300'
                        }`}
                      >
                        [{s.step}]
                      </span>
                      <span className="text-white/75 break-all">{s.detail}</span>
                    </div>
                  ))
                )}
              </div>

              {fallbackNote && (
                <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-400/30 p-3 text-xs text-amber-100 leading-relaxed">
                  ⚠️ {fallbackNote}
                </div>
              )}

              {error && (
                <div className="mt-3 rounded-xl bg-red-500/10 border border-red-400/30 p-3 text-sm text-red-200 flex items-start gap-2">
                  <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span className="break-all">{error}</span>
                </div>
              )}

              {reply && (
                <div className="mt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircleIcon className="w-5 h-5 text-emerald-300" />
                    <span className="text-sm text-emerald-200 font-semibold">执行结果</span>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(reply).catch(() => undefined)}
                      className="ml-auto text-xs text-white/60 hover:text-cyan-300 inline-flex items-center gap-1"
                    >
                      <ClipboardDocumentIcon className="w-3.5 h-3.5" /> 复制
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed bg-black/30 border border-white/10 rounded-xl p-4 max-h-96 overflow-y-auto">
                    {reply}
                  </pre>
                </div>
              )}
            </section>
          </div>

          {/* ===================== 右列：插件矩阵 + 战略定位 ===================== */}
          <aside className="space-y-6">
            {/* ④ 插件矩阵 */}
            <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5">
              <h2 className="font-bold flex items-center gap-2 mb-3">
                <PuzzlePieceIcon className="w-5 h-5 text-fuchsia-300" /> 插件矩阵
              </h2>
              <p className="text-[11px] text-white/45 mb-3 leading-relaxed">
                状态是真实的：<b className="text-emerald-300">已落地</b> = 仓库里有可用代码；
                <b className="text-amber-300">部分可用</b> = 通道或数据就绪、缺上游；
                <b className="text-white/60">规划中</b> = 尚未落地。不含任何空头支票。
              </p>
              <ul className="space-y-1.5 max-h-[430px] overflow-y-auto pr-1">
                {(status?.plugins ?? []).map((p) => {
                  const meta = STATUS_META[p.status];
                  return (
                    <li key={p.no} className="rounded-lg bg-black/25 border border-white/10 px-3 py-2">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">
                            <span className="text-white/40 font-mono mr-1.5">{String(p.no).padStart(2, '0')}</span>
                            {p.name}
                          </p>
                          <p className="text-[10px] text-white/40 mt-0.5 break-all">{p.evidence}</p>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${meta.cls}`}>{meta.label}</span>
                      </div>
                    </li>
                  );
                })}
                {!status && <li className="text-xs text-white/40">加载中…</li>}
              </ul>
            </section>

            {/* ⑤ 战略定位 */}
            <section className="rounded-2xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/10 border border-white/10 p-5">
              <h2 className="font-bold flex items-center gap-2 mb-3">
                <SignalSlashIcon className="w-5 h-5 text-fuchsia-300" /> 星链的死穴，与我们的位置
              </h2>
              <div className="text-xs text-white/65 leading-relaxed space-y-2">
                <p>
                  星链已经跑通的是<b className="text-white">「连得上」</b>：全球多个国家落地、
                  应急短信、语音与低带宽数据分批开放。但它的物理上限决定了它
                  <b className="text-white">跑不动大模型</b> ——
                  一个模型的权重就有几百 GB，推理需要高带宽低时延的机房内部互联，
                  还要长时间独占 GPU。
                </p>
                <p>
                  所以在星链上做 AI，唯一可行的形态是
                  <b className="text-cyan-200">「卫星只送指令，算力留在云端」</b>：
                  用户在无网环境发一条几十字节的短报文，云端 Harness 把任务跑完，
                  结果回传摘要 + 提取链接。
                </p>
                <p>
                  <b className="text-white">这正是本页存在的原因。</b>
                  星链负责「最后一公里」，Harness 负责「那一公里之后的全部算力」。
                  我们不是星链的竞争者，而是它的算力补全层 ——
                  这也是为什么 Harness 是这里的主梁骨，而不是一个可选项。
                </p>
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <div className="rounded-lg bg-black/25 border border-white/10 p-2 text-center">
                    <GlobeAltIcon className="w-4 h-4 mx-auto text-cyan-300 mb-1" />
                    <p className="text-[10px] text-white/55">星链 · 最后一公里</p>
                  </div>
                  <div className="rounded-lg bg-black/25 border border-white/10 p-2 text-center">
                    <CpuChipIcon className="w-4 h-4 mx-auto text-indigo-300 mb-1" />
                    <p className="text-[10px] text-white/55">Harness · 运行时主梁</p>
                  </div>
                  <div className="rounded-lg bg-black/25 border border-white/10 p-2 text-center">
                    <DocumentTextIcon className="w-4 h-4 mx-auto text-emerald-300 mb-1" />
                    <p className="text-[10px] text-white/55">B2 · 成果交付</p>
                  </div>
                </div>
              </div>
            </section>

            {/* 快速跳转 */}
            <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 text-xs">
              <p className="text-white/50 mb-2 flex items-center gap-1.5">
                <SparklesIcon className="w-4 h-4 text-cyan-300" /> 相关入口
              </p>
              <div className="flex flex-wrap gap-2">
                <a href="/satellite" className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">星链接入口</a>
                <a href="/satellite#drive" className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">我的卫星云盘</a>
                <a href="/satellite#expert" className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">工单看板</a>
                <a href="/recharge" className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">充值 Credits</a>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
