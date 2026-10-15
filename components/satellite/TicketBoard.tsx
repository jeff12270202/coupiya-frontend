'use client';

// ============================================================================
// components/satellite/TicketBoard.tsx —— 专家转包与工单看板
// ----------------------------------------------------------------------------
// 数据来源：components/satellite/tickets.ts（浏览器本地留痕）
// 为什么不连"服务端工单库"：Harness 编排层与专家人才库仍在建设中。在这一层
// 没有真正落地之前，任何"服务端工单"都只能是假的。因此这里如实呈现：
//   · 你在这台设备上提交过的任务与它们的真实结果
//   · 三色状态：红=需人工紧急（失败/高精尖）、黄=AI 处理中、绿=已完成
//   · 一条明确的通道：需要人工介入时，把工单号发给支持邮箱即可继续跟进
// 服务端上线后，把 listTickets() 换成 fetch 即可，本组件无需改动。
// ============================================================================

import { useCallback, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  InboxIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { BTN_GHOST, TICKET_STATUS, ticketMeta, type TicketStatus } from './shared';
import { clearTickets, listTickets, type SatelliteTicket } from './tickets';

type Filter = 'all' | TicketStatus;

export default function TicketBoard({
  tickets,
  onChange,
  onOpenTask,
}: {
  tickets: SatelliteTicket[];
  onChange: (list: SatelliteTicket[]) => void;
  onOpenTask: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string>('');
  const [copied, setCopied] = useState('');

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: tickets.length, urgent: 0, processing: 0, done: 0 };
    for (const t of tickets) c[t.status] += 1;
    return c;
  }, [tickets]);

  const shown = useMemo(
    () => (filter === 'all' ? tickets : tickets.filter((t) => t.status === filter)),
    [tickets, filter],
  );

  const reload = useCallback(() => onChange(listTickets()), [onChange]);

  const wipe = useCallback(() => {
    if (!window.confirm('清空本机工单记录？此操作只影响当前浏览器，不影响服务器上已提交的内容。')) return;
    onChange(clearTickets());
  }, [onChange]);

  const copyId = useCallback(async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  }, []);

  return (
    <>
      <p className="text-white/60 text-sm leading-relaxed mb-4">
        高精尖 / 工程图纸 / 复杂代码任务将转入「专家人才库」排队：AI 出初稿 → 实名专家精修 →
        成品上传后短信回传提取链接。<b>服务端工单库与专家库正在建设中</b>，
        下方展示的是您在本机提交过的真实任务与真实结果 —— 不虚构进度，不伪造状态。
      </p>

      {/* 筛选 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
            filter === 'all' ? 'bg-white/20 border-white/40 text-white' : 'bg-white/5 border-white/15 text-white/60 hover:bg-white/10'
          }`}
        >
          全部 {counts.all}
        </button>
        {TICKET_STATUS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setFilter(s.key)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
              filter === s.key ? s.chip : 'bg-white/5 border-white/15 text-white/60 hover:bg-white/10'
            }`}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot} mr-1.5 align-middle`} />
            {s.label} {counts[s.key]}
          </button>
        ))}
        <button type="button" onClick={reload} className="ml-auto text-xs text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1">
          <ArrowPathIcon className="w-3.5 h-3.5" /> 刷新
        </button>
        {tickets.length > 0 && (
          <button type="button" onClick={wipe} className="text-xs text-white/40 hover:text-red-300 inline-flex items-center gap-1">
            <TrashIcon className="w-3.5 h-3.5" /> 清空
          </button>
        )}
      </div>

      {/* 列表 */}
      {shown.length === 0 ? (
        <div className="rounded-xl bg-white/5 border border-dashed border-white/15 p-8 text-center">
          <InboxIcon className="w-8 h-8 mx-auto text-white/25 mb-2" />
          <p className="text-sm text-white/50 mb-3">
            {tickets.length === 0 ? '还没有工单。提交一个 AI 任务后，它会出现在这里。' : '当前筛选下没有工单。'}
          </p>
          <button type="button" onClick={onOpenTask} className={BTN_GHOST}>
            去提交 AI 任务
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((t) => {
            const meta = ticketMeta(t.status);
            const open = expanded === t.id;
            return (
              <li key={t.id} className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? '' : t.id)}
                  className="w-full text-left p-3 hover:bg-white/5 transition-colors"
                  aria-expanded={open}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{t.title}</p>
                      <p className="text-[11px] text-white/40 mt-0.5">
                        <span className="font-mono">{t.id}</span> · {t.category} ·{' '}
                        {new Date(t.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${meta.chip}`}>{meta.label}</span>
                  </div>
                </button>

                {open && (
                  <div className="px-3 pb-3 pt-0 border-t border-white/10 space-y-2">
                    <div className="flex items-center gap-2 text-[11px] text-white/45 pt-2">
                      <span className="font-mono">{t.id}</span>
                      <button type="button" onClick={() => void copyId(t.id)} className="text-cyan-300 hover:text-cyan-200">
                        <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                      </button>
                      {copied === t.id && <span className="text-emerald-300">已复制</span>}
                      {t.modelUsed && <span className="ml-auto">模型：{t.modelUsed}</span>}
                      <span>预估 {t.estCredits} Credits</span>
                    </div>

                    {t.error && (
                      <div className="rounded-lg bg-red-500/10 border border-red-400/25 p-3 text-xs text-red-200 flex items-start gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span className="break-all">{t.error}</span>
                      </div>
                    )}

                    {t.reply && (
                      <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed bg-black/25 border border-white/10 rounded-lg p-3 max-h-56 overflow-y-auto">
                        {t.reply}
                      </pre>
                    )}

                    {t.attachmentKeys.length > 0 && (
                      <p className="text-[11px] text-white/45">
                        附件 {t.attachmentKeys.length} 个已存入专属云盘（可在「我的卫星云盘」中查看与下载）
                      </p>
                    )}

                    {t.status === 'urgent' && (
                      <p className="text-[11px] text-amber-200/80">
                        需要人工介入？把工单号 <span className="font-mono">{t.id}</span> 发给{' '}
                        <a href="mailto:support@coupiya.com" className="underline hover:text-amber-100">
                          support@coupiya.com
                        </a>
                        ，我们会按此号跟进。
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
