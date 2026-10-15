'use client';

// ============================================================================
// components/satellite/tickets.ts —— 本地工单存储（浏览器侧，零后端依赖）
// ----------------------------------------------------------------------------
// 为什么用 localStorage 而不是数据库：
//   工单系统的服务端（Harness 编排 + 专家库）仍在建设中。在它上线前，前端
//   必须能"真实地"记录用户提交过什么，而不是假装提交成功。
//   → 本模块只做客户端留痕：用户刷新/关页后仍能看到自己的提交历史与结果。
//   → 服务端上线后，把 saveTicket/listTickets 换成 fetch 即可，调用方无需改动。
// ============================================================================

import type { TicketStatus } from './shared';

const KEY = 'coupiya.satellite.tickets.v1';
const MAX_KEEP = 50;

export interface SatelliteTicket {
  id: string;
  title: string;
  category: string;
  prompt: string;
  status: TicketStatus;
  /** 真实模型回复（AI 成功时为实际内容；失败时为空） */
  reply: string;
  /** 后端回报的实际模型名 */
  modelUsed?: string;
  /** 附件在 B2 上的 key 列表 */
  attachmentKeys: string[];
  /** 估算消耗（Credits） */
  estCredits: number;
  createdAt: number;
  finishedAt?: number;
  /** 失败原因（真实错误，不吞） */
  error?: string;
}

function safeParse(raw: string | null): SatelliteTicket[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((t): t is SatelliteTicket => !!t && typeof t === 'object' && typeof t.id === 'string');
  } catch {
    return [];
  }
}

/** 读取全部工单（最新在前）。SSR 阶段返回空数组，避免 hydration 不一致。 */
export function listTickets(): SatelliteTicket[] {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(KEY)).sort((a, b) => b.createdAt - a.createdAt);
}

export function saveTicket(ticket: SatelliteTicket): SatelliteTicket[] {
  if (typeof window === 'undefined') return [];
  const next = [ticket, ...listTickets().filter((t) => t.id !== ticket.id)].slice(0, MAX_KEEP);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 隐私模式下写入失败：不影响主流程 */
  }
  return next;
}

export function updateTicket(id: string, patch: Partial<SatelliteTicket>): SatelliteTicket[] {
  if (typeof window === 'undefined') return [];
  const next = listTickets().map((t) => (t.id === id ? { ...t, ...patch } : t));
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 同上 */
  }
  return next;
}

export function clearTickets(): SatelliteTicket[] {
  if (typeof window === 'undefined') return [];
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* 同上 */
  }
  return [];
}

/** 生成稳定且可读的工单号：SAT-<yyMMdd>-<4位随机> */
export function makeTicketId(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SAT-${yy}${mm}${dd}-${rand}`;
}
