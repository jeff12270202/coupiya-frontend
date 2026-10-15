'use client';

// ============================================================================
// components/satellite/shared.tsx —— 星链接入口 · 共享常量与基础组件
// ----------------------------------------------------------------------------
// 为什么单独抽一层：
//   1. 机型兼容库 / 工单状态色 / 底部图标栏配置 → 三个以上组件共用，避免复制粘贴
//   2. 弹窗与卡片是全站视觉基线 → 一处定义，全模块一致（改一次全站生效）
//   3. 所有数据 `as const` 冻结 → 编译期即可发现拼写错误
// ============================================================================

import type { ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

/* ============================================================================
 * 一、手机卫星直连兼容库
 * ----------------------------------------------------------------------------
 * 原则：只标注公开可查的真实能力，绝不夸大（不写"点一下就上网"）。
 * match 用小写片段做 includes 匹配，故意保留前导空格以避免 "iphone 1" 误配
 * "iphone 11" 之外的机型 —— 见下方 detectDevice 的二次校验。
 * ========================================================================= */

export interface DirectEntry {
  brand: string;
  /** 小写匹配片段 */
  match: string;
  /** 型号全称说明 */
  note: string;
  /** 覆盖区域 */
  region: string;
  /** 实际能力 */
  cap: string;
}

export const DIRECT_DB: ReadonlyArray<DirectEntry> = [
  { brand: 'Apple iPhone', match: 'iphone 14', note: 'iPhone 14 / 14 Pro / 14 Pro Max', region: '美国等（T-Mobile Direct to Cell 试点）', cap: 'SMS 短信（含紧急 SOS）' },
  { brand: 'Apple iPhone', match: 'iphone 15', note: 'iPhone 15 全系列', region: '美国等（T-Mobile Direct to Cell 试点）', cap: 'SMS 短信（含紧急 SOS）' },
  { brand: 'Apple iPhone', match: 'iphone 16', note: 'iPhone 16 全系列', region: '美国等（T-Mobile Direct to Cell 试点）', cap: 'SMS 短信（含紧急 SOS）' },
  { brand: 'Apple iPhone', match: 'iphone 17', note: 'iPhone 17 全系列', region: '美国等（T-Mobile Direct to Cell 试点）', cap: 'SMS 短信（含紧急 SOS）' },
  { brand: 'Samsung', match: 'galaxy s25', note: 'Galaxy S25 系列', region: '美国等（运营商直连试点）', cap: 'SMS 短信' },
  { brand: 'Google', match: 'pixel 9', note: 'Pixel 9 / Pro / Pro XL', region: '美国等（运营商直连试点）', cap: 'SMS 短信 + 卫星 SOS' },
  { brand: 'Huawei', match: 'mate 60', note: 'Mate 60 / Pro / Pro+ / RS', region: '中国及天通覆盖周边', cap: '天通语音 + 北斗短消息' },
  { brand: 'Huawei', match: 'mate 70', note: 'Mate 70 / Pro / Pro+', region: '中国及天通覆盖周边', cap: '天通语音 + 北斗短消息' },
  { brand: 'Huawei', match: 'mate x5', note: 'Mate X5 折叠屏', region: '中国及天通覆盖周边', cap: '天通语音 + 北斗短消息' },
  { brand: 'Huawei', match: 'mate x6', note: 'Mate X6 折叠屏', region: '中国及天通覆盖周边', cap: '天通语音 + 北斗短消息' },
  { brand: 'Huawei', match: 'pura 70', note: 'Pura 70 / 70 Pro / 70 Ultra', region: '中国及天通覆盖周边', cap: '北斗短消息' },
  { brand: 'HONOR', match: 'magic6', note: 'Magic6 / Magic6 Pro', region: '中国及天通覆盖周边', cap: '天通语音' },
  { brand: 'HONOR', match: 'magic7', note: 'Magic7 / Magic7 Pro', region: '中国及天通覆盖周边', cap: '天通语音' },
  { brand: 'HONOR', match: 'magic v2', note: 'Magic V2 折叠屏', region: '中国及天通覆盖周边', cap: '天通语音' },
  { brand: 'HONOR', match: 'magic v3', note: 'Magic V3 折叠屏', region: '中国及天通覆盖周边', cap: '天通语音' },
  { brand: 'Xiaomi', match: '14 ultra', note: '小米 14 Ultra', region: '中国及天通覆盖周边', cap: '天通语音' },
  { brand: 'Xiaomi', match: '15 pro', note: '小米 15 Pro', region: '中国及天通覆盖周边', cap: '天通语音' },
  { brand: 'Xiaomi', match: '15 ultra', note: '小米 15 Ultra', region: '中国及天通覆盖周边', cap: '天通语音' },
  { brand: 'vivo', match: 'x200 pro', note: 'vivo X200 Pro', region: '中国及天通覆盖周边', cap: '天通语音' },
  { brand: 'vivo', match: 'x200 ultra', note: 'vivo X200 Ultra', region: '中国及天通覆盖周边', cap: '天通语音' },
  { brand: 'OPPO', match: 'find x8', note: 'OPPO Find X8 系列', region: '中国及天通覆盖周边', cap: '天通语音' },
];

export interface DetectResult {
  hit: boolean;
  entry?: DirectEntry;
  text: string;
}

/**
 * 纯前端机型兼容判定。
 * 注意：不做任何网络请求，用户输入的机型不会离开浏览器 —— 隐私友好，
 * 也是本页能在无网环境说明里被信任的前提。
 */
export function detectDevice(model: string): DetectResult {
  const q = model.trim().toLowerCase();
  if (!q) return { hit: false, text: '' };
  // 长片段优先，避免 "iphone 1" 命中 "iphone 14" 这类前缀误判
  const sorted = [...DIRECT_DB].sort((a, b) => b.match.length - a.match.length);
  for (const item of sorted) {
    if (q.includes(item.match)) {
      return {
        hit: true,
        entry: item,
        text: `${item.brand} ${item.note}｜覆盖：${item.region}｜能力：${item.cap}`,
      };
    }
  }
  return {
    hit: false,
    text: '未检测到已上市的卫星直连机型。可选购硬件终端（Starlink Mini 等），或留意运营商直连机型名单的后续更新。',
  };
}

/* ============================================================================
 * 二、工单状态（红 / 黄 / 绿 三色语义，全站统一）
 * ========================================================================= */

export type TicketStatus = 'urgent' | 'processing' | 'done';

export interface TicketStatusMeta {
  key: TicketStatus;
  label: string;
  dot: string;
  chip: string;
}

export const TICKET_STATUS: ReadonlyArray<TicketStatusMeta> = [
  { key: 'urgent', label: '需人工紧急处理', dot: 'bg-red-400', chip: 'bg-red-500/20 text-red-200 border-red-400/30' },
  { key: 'processing', label: 'AI 处理中', dot: 'bg-amber-400', chip: 'bg-amber-500/20 text-amber-200 border-amber-400/30' },
  { key: 'done', label: '已完成', dot: 'bg-emerald-400', chip: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' },
];

/** 显式兜底常量：不使用 TICKET_STATUS[1] 索引，避免 noUncheckedIndexedAccess 下的 undefined */
const FALLBACK_STATUS: TicketStatusMeta = {
  key: 'processing',
  label: 'AI 处理中',
  dot: 'bg-amber-400',
  chip: 'bg-amber-500/20 text-amber-200 border-amber-400/30',
};

export function ticketMeta(key: TicketStatus): TicketStatusMeta {
  return TICKET_STATUS.find((s) => s.key === key) ?? FALLBACK_STATUS;
}

/* ============================================================================
 * 三、视觉基线组件
 * ========================================================================= */

export function SectionCard({
  id,
  title,
  icon,
  desc,
  tone = 'plain',
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  desc?: ReactNode;
  tone?: 'plain' | 'indigo' | 'teal';
  children: ReactNode;
}) {
  const toneCls =
    tone === 'indigo'
      ? 'bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/10 border-white/10'
      : tone === 'teal'
        ? 'bg-gradient-to-br from-teal-500/10 to-cyan-500/5 border-white/10'
        : 'bg-white/5 border-white/10';
  return (
    <section id={id} className={`${toneCls} border rounded-3xl p-6 scroll-mt-24`}>
      <h2 className="text-2xl font-bold flex items-center gap-2 mb-2">
        {icon}
        {title}
      </h2>
      {desc ? <div className="text-white/60 text-sm mb-4 leading-relaxed">{desc}</div> : null}
      {children}
    </section>
  );
}

export function SatelliteModal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[88vh] overflow-y-auto rounded-2xl bg-[#0d1640] border border-white/15 p-6 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4 gap-4">
          <div>
            <h3 className="font-bold text-lg">{title}</h3>
            {subtitle ? <p className="text-xs text-white/50 mt-1">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="p-2 rounded-full hover:bg-white/10 flex-shrink-0">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 统一的表单输入样式（避免每个输入框重复写一遍类名） */
export const INPUT_CLS =
  'w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-400';

export const BTN_PRIMARY =
  'px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 font-semibold hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed';

export const BTN_GHOST = 'px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium';
