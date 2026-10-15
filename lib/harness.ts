// ============================================================================
// lib/harness.ts —— Harness 运行时主梁 · 方案 A（Serverless Harness Worker）客户端
// ----------------------------------------------------------------------------
// 为什么是"方案 A"而不是"把 Harness 装到云服务器磁盘里"：
//   Harness 是位于大模型之上的【运行时层】，不是可以 apt install 的常驻软件。
//   官方形态是 `npx @deepseek-ai/dsh web --headless` 拉起一个实例、执行任务、
//   然后销毁 —— 天然适合 Serverless（AWS Lambda / 阿里云函数计算 / 腾讯云 SCF）。
//   我们的站点要 24 小时给全球用户服务，而流量是零散脉冲式的：
//   常驻 Runtime 会 99% 的时间在为空闲付费，Serverless 只在任务到达时计费。
//
// 【本文件只定义"客户端 + 契约"，不含 Worker 实现】—— 这是刻意的：
//   1. Worker 是独立部署单元（容器镜像），不该塞进 Next.js 仓库；
//   2. 未配置 HARNESS_WORKER_URL 时，本模块明确返回"未配置"，
//      调用方据此回退到既有的 /api/ai/chat，而不是伪造一个"Harness 已完成"。
//
// Worker 需要实现的契约（HTTP/JSON，一次性请求-响应，无需长连接）：
//   POST {HARNESS_WORKER_URL}
//   Authorization: Bearer {HARNESS_WORKER_TOKEN}
//   Body: HarnessTaskRequest
//   200 : HarnessTaskResult
// ============================================================================

/* ---------------------------------------------------------------------------
 * 一、插件目录 —— 20 个插件的真实落地状态
 * ---------------------------------------------------------------------------
 * status 的取值是诚实的，没有任何一个"已落地"是空头支票：
 *   live     = 本仓库里已有可用代码，今天就能跑
 *   partial  = 部分可用（通道/数据已就绪，缺上游或密钥）
 *   planned  = 尚未落地，需要 Worker 或第三方对接
 * ------------------------------------------------------------------------- */

export type PluginStatus = 'live' | 'partial' | 'planned';

export interface HarnessPlugin {
  no: number;
  name: string;
  group: '模型适配' | '工具链' | '业务逻辑' | '交互展示';
  status: PluginStatus;
  /** 已落地时指向真实代码位置；未落地时说明缺什么 */
  evidence: string;
}

export const HARNESS_PLUGINS: ReadonlyArray<HarnessPlugin> = [
  { no: 1, name: 'DeepSeek LLM Provider', group: '模型适配', status: 'live', evidence: 'lib/ai-models.ts + app/api/ai/chat/route.ts' },
  { no: 2, name: 'GPT-6 兼容 Provider', group: '模型适配', status: 'partial', evidence: '通道已建（openai-compatible），需网关侧配置密钥' },
  { no: 3, name: '模型路由与故障转移', group: '模型适配', status: 'live', evidence: 'resolveModel() + callUpstream() 网络层重试' },
  { no: 4, name: 'B2 云存储工具', group: '工具链', status: 'live', evidence: 'lib/b2.ts（建桶/受限密钥/预签名/生命周期）' },
  { no: 5, name: '代码执行沙箱工具', group: '工具链', status: 'planned', evidence: '需 Harness Worker 提供隔离运行时' },
  { no: 6, name: '工程图纸解析工具', group: '工具链', status: 'planned', evidence: '需 CAD/DWG 解析服务（建议随 Worker 容器一起打包）' },
  { no: 7, name: '图像识别与 OCR', group: '工具链', status: 'partial', evidence: '图片附件理解 + MiniMax-VL，独立 OCR 待接' },
  { no: 8, name: '多语言翻译工具', group: '工具链', status: 'live', evidence: 'app/api/ai/translate/route.ts' },
  { no: 9, name: '网络搜索工具', group: '工具链', status: 'live', evidence: 'app/api/ai/web-search/route.ts（SERPAPI）' },
  { no: 10, name: '文档生成工具', group: '工具链', status: 'planned', evidence: 'pptx/docx/xlsx 生成待落地' },
  { no: 11, name: '任务复杂度评估', group: '业务逻辑', status: 'live', evidence: 'TaskModal assess()（本地可解释规则）' },
  { no: 12, name: '专家转包 MCP 服务', group: '业务逻辑', status: 'planned', evidence: '需对接 MCP 专家平台并完成一次性服务器配置' },
  { no: 13, name: '卫星短信触发', group: '业务逻辑', status: 'planned', evidence: '需短信网关（天通 / 新消息）对接' },
  { no: 14, name: '多引擎计费与扣费', group: '业务逻辑', status: 'partial', evidence: 'Credits 账本已落地（lib/ledger.ts）；BYO-Key 直扣规划中' },
  { no: 15, name: '任务生命周期管理', group: '业务逻辑', status: 'partial', evidence: '本地工单状态机已落地；服务端工单库待建' },
  { no: 16, name: '审计日志与合规', group: '业务逻辑', status: 'partial', evidence: '各 API route 输出结构化 JSON 日志；集中审计待建' },
  { no: 17, name: '任务弹窗 UI', group: '交互展示', status: 'live', evidence: 'components/satellite/TaskModal.tsx' },
  { no: 18, name: '工单看板', group: '交互展示', status: 'live', evidence: 'components/satellite/TicketBoard.tsx' },
  { no: 19, name: '专家工作台', group: '交互展示', status: 'planned', evidence: '待专家体系上线' },
  { no: 20, name: '卫星云盘管理', group: '交互展示', status: 'live', evidence: 'components/satellite/DrivePanel.tsx + /api/b2/objects' },
];

export function pluginSummary() {
  const live = HARNESS_PLUGINS.filter((p) => p.status === 'live').length;
  const partial = HARNESS_PLUGINS.filter((p) => p.status === 'partial').length;
  return { total: HARNESS_PLUGINS.length, live, partial, planned: HARNESS_PLUGINS.length - live - partial };
}

/* ---------------------------------------------------------------------------
 * 二、Worker 配置与契约
 * ------------------------------------------------------------------------- */

export interface HarnessConfig {
  configured: boolean;
  /** 打码后的 URL，可安全回显到前端 */
  workerUrlMasked: string;
  hasToken: boolean;
  timeoutMs: number;
  /** 部署形态，用于前端展示 */
  mode: 'serverless-worker';
}

export interface HarnessAttachment {
  type: 'image' | 'document';
  base64?: string;
  text?: string;
  fileName: string;
}

export interface HarnessTaskRequest {
  taskId: string;
  title: string;
  category: string;
  prompt: string;
  model?: string;
  userId?: number;
  attachments?: HarnessAttachment[];
  /** 请求 Worker 启用的插件编号（不传 = 用 Worker 默认集） */
  plugins?: number[];
}

export interface HarnessTrajectoryStep {
  ts: string;
  step: string;
  detail: string;
  level?: 'info' | 'warn' | 'error';
}

export interface HarnessTaskResult {
  success: boolean;
  reply: string;
  model_used?: string;
  usage?: Record<string, unknown>;
  /** Harness 会话日志派生的执行轨迹 —— 前端用它做"执行透明化" */
  trajectory?: HarnessTrajectoryStep[];
  /** 产出物（已上传到 B2 的文件） */
  artifacts?: Array<{ name: string; key?: string; url?: string }>;
  error?: string;
  requestId?: string;
}

function readWorkerUrl(): string {
  return (process.env.HARNESS_WORKER_URL ?? '').trim();
}

export function harnessConfigured(): boolean {
  return readWorkerUrl().length > 0;
}

export function harnessConfig(): HarnessConfig {
  const url = readWorkerUrl();
  let masked = '';
  if (url) {
    try {
      const u = new URL(url);
      masked = `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`;
    } catch {
      masked = '(URL 格式非法)';
    }
  }
  return {
    configured: url.length > 0,
    workerUrlMasked: masked,
    hasToken: (process.env.HARNESS_WORKER_TOKEN ?? '').length > 0,
    timeoutMs: Number(process.env.HARNESS_WORKER_TIMEOUT_MS ?? 120_000),
    mode: 'serverless-worker',
  };
}

/**
 * 调用 Serverless Harness Worker 执行一次高精尖任务。
 *
 * 失败语义（刻意区分，前端可据此给不同提示）：
 *   · 未配置 Worker        → throw HarnessNotConfiguredError（前端回退到 /api/ai/chat）
 *   · 网络/超时            → throw Error（可重试）
 *   · Worker 返回非 2xx    → throw Error（带 Worker 的原始错误文本，不吞）
 */
export class HarnessNotConfiguredError extends Error {
  constructor() {
    super('HARNESS_WORKER_URL 未配置：Harness Worker 尚未部署，当前请使用标准通道');
    this.name = 'HarnessNotConfiguredError';
  }
}

export async function runHarnessTask(req: HarnessTaskRequest): Promise<HarnessTaskResult> {
  const url = readWorkerUrl();
  if (!url) throw new HarnessNotConfiguredError();

  const cfg = harnessConfig();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = (process.env.HARNESS_WORKER_TOKEN ?? '').trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });

  const raw = await res.text();
  let data: HarnessTaskResult | null = null;
  try {
    data = JSON.parse(raw) as HarnessTaskResult;
  } catch {
    /* 非 JSON 响应：下面按错误处理，并把原文截断回显，便于定位 */
  }

  if (!res.ok) {
    const hint = data?.error ?? raw.slice(0, 400) ?? '';
    throw new Error(`Harness Worker 返回 HTTP ${res.status}${hint ? `：${hint}` : ''}`);
  }
  if (!data) {
    throw new Error(`Harness Worker 返回了非 JSON 响应（前 200 字符）：${raw.slice(0, 200)}`);
  }
  return data;
}
