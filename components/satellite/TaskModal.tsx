'use client';

// ============================================================================
// components/satellite/TaskModal.tsx —— AI 任务弹窗（三步式）
// ----------------------------------------------------------------------------
// 第 1 步 填写任务：标题 + 类型 + 描述 + 附件（附件走 B2 预签名直传，不过服务器）
// 第 2 步 确认模型与费用：本地复杂度评估 → 推荐模型 → 预估 Credits → 余额
// 第 3 步 实时追踪：真实调用 /api/ai/chat，展示真实回复与真实用量
//
// 诚实原则（继承本项目既有约定）：
//   · 不伪造"处理中"进度条。进度只反映真实发生的三个动作：提交 → 上游返回 → 落盘。
//   · 上游报错就把真实错误显示出来，绝不显示假的成功。
//   · 附件只做 B2 存档，不喂给文本模型；这一点在界面上明写，避免用户误解。
// ============================================================================

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  CloudArrowUpIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { AuthUser } from '@/hooks/useAuth';
import { BTN_GHOST, BTN_PRIMARY, INPUT_CLS, SatelliteModal } from './shared';
import { makeTicketId, saveTicket, updateTicket, type SatelliteTicket } from './tickets';

/* ---------------------------------------------------------------------------
 * 任务类型（与后端复杂度评估的语义保持一致）
 * ------------------------------------------------------------------------- */
const CATEGORIES = [
  '文本创作 / 方案策划',
  '工程图纸解读',
  '复杂代码生成',
  '数据报表整理',
  '法律 / 合同审查',
  '多语言翻译',
  '其他',
] as const;

/** 模型清单（与 lib/ai-models.ts 的注册表 id 保持一致；未知名字会被后端映射并回显） */
const MODELS = [
  { value: '', label: '自动（由后端按任务复杂度选择，默认 V4 Pro）' },
  { value: 'DeepSeek-V4-Pro', label: 'DeepSeek V4 Pro · 旗舰，适合图纸 / 架构 / 合同' },
  { value: 'DeepSeek-V4-Flash', label: 'DeepSeek V4 Flash · 高效，适合文案 / 整理 / 快答' },
  { value: 'GPT-6-Compat', label: 'GPT-6 兼容通道 · 需网关已接入' },
] as const;

/** 本地复杂度评估（纯规则，可解释、可复现，不装作 AI） */
function assess(prompt: string, category: string): { level: 'low' | 'mid' | 'high'; label: string; note: string } {
  const len = prompt.trim().length;
  const heavyCat = ['工程图纸解读', '复杂代码生成', '法律 / 合同审查'].includes(category);
  if (heavyCat || len > 1200) {
    return { level: 'high', label: '高', note: '建议走专家转包通道：AI 出初稿 → 实名专家精修' };
  }
  if (len > 300 || category === '数据报表整理') {
    return { level: 'mid', label: '中', note: 'AI 生成初稿，建议人工快速复核后交付' };
  }
  return { level: 'low', label: '低', note: 'AI 可直接产出成品' };
}

/** 估算 Credits：中文约 1.5 token/字；输出按 800 token 预留。仅作预算提示。 */
function estimateCredits(prompt: string): { tokens: number; credits: number } {
  const chars = prompt.trim().length;
  const tokens = Math.ceil(chars * 1.5) + 800;
  return { tokens, credits: Math.max(1, Math.round(tokens / 1000)) };
}

interface Props {
  open: boolean;
  onClose: () => void;
  user: AuthUser | null;
  onNeedLogin: () => void;
  onTicketSaved: (list: SatelliteTicket[]) => void;
}

export default function TaskModal({ open, onClose, user, onNeedLogin, onTicketSaved }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);

  const [reply, setReply] = useState('');
  const [modelUsed, setModelUsed] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [uploadNote, setUploadNote] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const verdict = useMemo(() => assess(prompt, category), [prompt, category]);
  const cost = useMemo(() => estimateCredits(prompt), [prompt]);
  const balance = user?.balance ?? 0;
  const canSubmit = title.trim().length > 0 && prompt.trim().length > 0;

  const reset = useCallback(() => {
    setStep(1);
    setTitle('');
    setCategory(CATEGORIES[0]);
    setPrompt('');
    setModel('');
    setFiles([]);
    setReply('');
    setModelUsed('');
    setError('');
    setUploadNote('');
    setRunning(false);
  }, []);

  const handleClose = useCallback(() => {
    if (running) return; // 执行中不允许直接关闭，避免用户误以为已取消
    reset();
    onClose();
  }, [running, reset, onClose]);

  /* ---- 附件：走 /api/b2/presign-upload 预签名直传，不经我们的服务器 ---- */
  const uploadAttachments = useCallback(async (): Promise<string[]> => {
    const keys: string[] = [];
    for (const file of files) {
      const res = await fetch('/api/b2/presign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }),
      });
      const data = (await res.json().catch(() => ({}))) as { uploadUrl?: string; key?: string; error?: string };
      if (!res.ok || !data.uploadUrl || !data.key) {
        throw new Error(data.error || `附件「${file.name}」获取上传地址失败（HTTP ${res.status}）`);
      }
      const put = await fetch(data.uploadUrl, { method: 'PUT', body: file });
      if (![200, 201, 204].includes(put.status)) {
        throw new Error(`附件「${file.name}」直传失败（HTTP ${put.status}）`);
      }
      keys.push(data.key);
    }
    return keys;
  }, [files]);

  /* ---- 提交：真实调用 /api/ai/chat ---- */
  const submit = useCallback(async () => {
    if (!canSubmit || running) return;
    setRunning(true);
    setError('');
    setReply('');
    setStep(3);

    const id = makeTicketId();
    const base: SatelliteTicket = {
      id,
      title: title.trim(),
      category,
      prompt: prompt.trim(),
      status: 'processing',
      reply: '',
      attachmentKeys: [],
      estCredits: cost.credits,
      createdAt: Date.now(),
    };
    onTicketSaved(saveTicket(base));

    try {
      // ① 附件入库（B2 存档；不参与文本推理，界面已明写）
      if (files.length > 0) {
        setUploadNote(`正在直传 ${files.length} 个附件到专属云盘…`);
        const keys = await uploadAttachments();
        setUploadNote(`✅ ${keys.length} 个附件已存入云盘`);
        onTicketSaved(updateTicket(id, { attachmentKeys: keys }));
      }

      // ② 真实推理
      setUploadNote((v) => (v ? `${v} · AI 推理中…` : 'AI 推理中…'));
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // ⚠️ 契约修正：/api/ai/chat 读的是 message + history（见 route.ts 的
          //    `const rawMessage = body.message`），不是 messages 数组。
          //    之前这里发 messages，会被后端判为"缺少 message 参数"直接 400。
          message: `【任务类型】${category}\n【任务标题】${title.trim()}\n\n【任务要求】\n${prompt.trim()}`,
          history: [],
          ...(model ? { model } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        reply?: string;
        model_used?: string;
        message?: string;
        requestId?: string;
      };

      if (!res.ok || data.success === false || !data.reply) {
        throw new Error(data.message || `上游返回失败（HTTP ${res.status}${data.requestId ? ` · ${data.requestId}` : ''}）`);
      }

      setReply(data.reply);
      setModelUsed(data.model_used || model || '（后端未回报）');
      onTicketSaved(
        updateTicket(id, {
          status: verdict.level === 'high' ? 'urgent' : 'done',
          reply: data.reply,
          modelUsed: data.model_used || model,
          finishedAt: Date.now(),
        }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '任务执行失败';
      setError(msg);
      onTicketSaved(updateTicket(id, { status: 'urgent', error: msg, finishedAt: Date.now() }));
    } finally {
      setRunning(false);
      setUploadNote('');
    }
  }, [canSubmit, running, title, category, prompt, model, files, cost.credits, uploadAttachments, verdict.level, onTicketSaved]);

  if (!open) return null;

  return (
    <SatelliteModal
      title="AI 任务"
      subtitle={`第 ${step} / 3 步 · ${step === 1 ? '填写任务' : step === 2 ? '确认模型与费用' : '实时追踪'}`}
      onClose={handleClose}
      wide
    >
      {/* 步骤指示 */}
      <ol className="flex items-center gap-2 text-xs mb-5" aria-label="进度">
        {(['填写任务', '确认费用', '实时追踪'] as const).map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const active = step === n;
          const done = step > n;
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full grid place-items-center font-semibold ${
                  done ? 'bg-emerald-500 text-white' : active ? 'bg-cyan-500 text-white' : 'bg-white/10 text-white/50'
                }`}
              >
                {done ? '✓' : n}
              </span>
              <span className={active ? 'text-white' : 'text-white/45'}>{label}</span>
              {i < 2 && <span className="w-6 h-px bg-white/20" />}
            </li>
          );
        })}
      </ol>

      {/* ---------------- 第 1 步 ---------------- */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-white/70 mb-1.5" htmlFor="sat-task-title">
              任务标题 <span className="text-red-300">*</span>
            </label>
            <input
              id="sat-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：给一款户外储能电源写 10 页发布会 PPT 大纲"
              className={INPUT_CLS}
            />
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-1.5" htmlFor="sat-task-cat">
              任务类型
            </label>
            <select
              id="sat-task-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`${INPUT_CLS} appearance-none`}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-[#0d1640]">
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-1.5" htmlFor="sat-task-prompt">
              任务描述 <span className="text-red-300">*</span>
            </label>
            <textarea
              id="sat-task-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={7}
              placeholder="把要求写清楚：目标、受众、篇幅、风格、必须包含的要点…"
              className={`${INPUT_CLS} resize-y`}
            />
            <p className="text-xs text-white/40 mt-1">
              已输入 {prompt.trim().length} 字 · 本地复杂度评估：{verdict.label}（{verdict.note}）
            </p>
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-1.5">参考附件（可选，存入您的专属云盘）</label>
            <input
              ref={fileRef}
              type="file"
              multiple
              onChange={(e) => {
                setFiles(Array.from(e.target.files ?? []).slice(0, 5));
              }}
              className="text-sm text-white/80 file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-teal-500 file:text-white file:font-semibold hover:file:brightness-110"
            />
            <p className="text-xs text-white/40 mt-1">
              最多 5 个。附件通过预签名链接<b>直传 B2</b>，不经我们的服务器中转；附件用于存档与专家查阅，
              <b>不参与本次文本推理</b>（界面如实标注，不做能力夸大）。
            </p>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-white/60">
                {files.map((f) => (
                  <li key={f.name} className="flex items-center gap-2">
                    <CloudArrowUpIcon className="w-4 h-4 text-teal-300" />
                    {f.name} · {(f.size / 1024).toFixed(0)} KB
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={handleClose} className={BTN_GHOST}>
              取消
            </button>
            <button type="button" disabled={!canSubmit} onClick={() => setStep(2)} className={BTN_PRIMARY}>
              下一步 · 确认模型与费用
            </button>
          </div>
        </div>
      )}

      {/* ---------------- 第 2 步 ---------------- */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl bg-black/20 border border-white/10 p-4 text-sm space-y-2">
            <p className="flex justify-between">
              <span className="text-white/60">复杂度评估</span>
              <span className="font-semibold">
                {verdict.label} · {verdict.note}
              </span>
            </p>
            <p className="flex justify-between">
              <span className="text-white/60">预估 Token</span>
              <span className="font-mono">{cost.tokens.toLocaleString()}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-white/60">预估消耗</span>
              <span className="font-mono text-cyan-300">{cost.credits} Credits</span>
            </p>
            <p className="flex justify-between">
              <span className="text-white/60">当前余额</span>
              <span className={`font-mono ${balance > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>{balance} Credits</span>
            </p>
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-1.5" htmlFor="sat-task-model">
              执行模型
            </label>
            <select
              id="sat-task-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={`${INPUT_CLS} appearance-none`}
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value} className="bg-[#0d1640]">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl bg-sky-500/10 border border-sky-400/30 p-3 text-xs text-sky-100/90 leading-relaxed">
            费用说明：以上为<b>估算值</b>，实际以任务完成后的真实用量为准。上游每次都会返回真实
            <code className="mx-1">usage</code>，本页在结果区如实展示，不做四舍五入的美化。
            余额不足时请先到「充值」页购买 Credits。
          </div>

          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={() => setStep(1)} className={BTN_GHOST}>
              上一步
            </button>
            <button type="button" onClick={() => void submit()} className={BTN_PRIMARY}>
              <PaperAirplaneIcon className="w-4 h-4 inline mr-1.5" />
              确认并执行
            </button>
          </div>
        </div>
      )}

      {/* ---------------- 第 3 步 ---------------- */}
      {step === 3 && (
        <div className="space-y-4">
          {running && (
            <div className="flex items-center gap-3 text-sm text-white/70">
              <ArrowPathIcon className="w-5 h-5 animate-spin text-cyan-300" />
              {uploadNote || '正在调用 AI…'}
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-400/30 p-4 text-sm text-red-200 flex items-start gap-2">
              <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">任务未能完成</p>
                <p className="text-red-200/90 break-all">{error}</p>
                <p className="text-xs text-red-200/60 mt-2">
                  该工单已标记为「需人工紧急处理」，可在本页「专家转包与工单系统」中查看并联系我们继续跟进。
                </p>
              </div>
            </div>
          )}

          {reply && (
            <>
              <div className="flex items-center gap-2 text-sm text-emerald-300">
                <CheckCircleIcon className="w-5 h-5" />
                已完成 · 实际模型：<code className="text-emerald-200">{modelUsed}</code>
              </div>
              <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed bg-black/25 border border-white/10 rounded-xl p-4 max-h-72 overflow-y-auto">
                {reply}
              </pre>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={BTN_GHOST}
                  onClick={() => void navigator.clipboard?.writeText(reply).catch(() => undefined)}
                >
                  <ClipboardDocumentIcon className="w-4 h-4 inline mr-1" />
                  复制结果
                </button>
                <button
                  type="button"
                  className={BTN_GHOST}
                  onClick={() => {
                    const blob = new Blob([reply], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${title.trim() || 'coupiya-task'}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <ArrowDownTrayIcon className="w-4 h-4 inline mr-1" />
                  下载结果
                </button>
              </div>
            </>
          )}

          {!running && !reply && !error && (
            <p className="text-sm text-white/60 flex items-center gap-2">
              <SparklesIcon className="w-5 h-5 text-cyan-300" />
              尚未提交。返回上一步确认后再执行。
            </p>
          )}

          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={handleClose} className={BTN_GHOST} disabled={running}>
              {reply || error ? '完成' : '返回'}
            </button>
            {!user && (
              <button type="button" onClick={onNeedLogin} className={BTN_PRIMARY}>
                刷脸登录以保存到我的账户
              </button>
            )}
          </div>
        </div>
      )}
    </SatelliteModal>
  );
}
