// ============================================================================
// app/api/ai/chat/route.ts —— 全球生产级聊天网关（FloatingChat 模型代理）
// ----------------------------------------------------------------------------
// 职责：接收网站前端聊天请求 → 多模态预处理（MiniMax-VL 看图）→ 文档 RAG
//       → 调用上游 LLM（Hermes 内网网关 / deepseek-r1）→ 拦截 tool_calls
//       → 返回给前端执行（支持工具回调闭环）→ 可选 SSE 流式输出
//
// 与平台全局架构的关系：
//   - 聊天助手（FloatingChat）属于【免费开放】能力，全站游客可用；
//     但必须限流 + 结构化日志，防止上游算力被刷爆（成本归属平台主账号）；
//   - 返回 usage（token 用量），为后续「价格快照 + 事务双写」计费体系留好数据；
//   - 绝不把浏览器 Authorization 透传给上游（凭证泄漏面），上游一律走服务端 Key。
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { buildModelAliases, defaultModel } from '@/lib/ai-models';
import { catalogDigest } from '@/lib/site-catalog';
import { toolSchemasForUpstream } from '@/lib/site-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 平台允许的最大执行时长（秒）

/* ===========================================================================
 * 一、配置中心（所有魔法数字/硬编码集中在这里，便于按环境覆盖）
 * ========================================================================= */

const CFG = {
  // ---- 上游 LLM（Hermes 内网网关） ----
  upstream: process.env.HERMES_CHAT_ENDPOINT ?? 'http://10.136.131.232:8082/v1/chat/completions',
  /** 服务端 Key。生产环境必须配置；缺失时【fail-closed】，绝不透传客户端凭证 */
  upstreamApiKey: process.env.HERMES_API_KEY ?? '',
  timeoutMs: Number(process.env.CHAT_TIMEOUT_MS ?? 30_000),
  maxRetries: 2, // 仅网络层失败重试（HTTP 错误不重试，避免重复计费）

  // ---- 官方 API 兜底通道（Hermes 网关不可达时自动切换） ----
  // 为什么必须要有：
  //   实测 Hermes 网关（api.coupiya.com/ai/）会整体 502，此时整个助手就哑了 ——
  //   而 Agent 的工具调用能力完全依赖这条链路。DeepSeek 官方 API 是直连且稳定的，
  //   官方语义与 OpenAI 兼容（含 function calling），因此作为兜底最合适。
  //   兜底只在【主通道失败】时启用，不影响正常路径，也不会造成重复计费
  //   （HTTP 错误不重试，只在明确失败后才换通道重发一次）。
  fallbackUpstream: process.env.DEEPSEEK_FALLBACK_ENDPOINT ?? 'https://api.deepseek.com/v1/chat/completions',
  fallbackApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  fallbackTimeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 60_000),

  // ---- 模型映射（唯一事实来源：lib/ai-models.ts） ----
  // 以前这里硬编码了 4 条别名，且把 V3 也映射到 R1 —— 前端下拉写着 V3、
  // 实际跑 R1，用户看到的和跑的不是一个模型。现在模型清单集中在注册表，
  // 默认模型升级为 DeepSeek V4 Pro（旧名 deepseek-chat / deepseek-reasoner
  // 已被官方停用，V4 为当前主力）。
  defaultModel: defaultModel().upstream,
  modelAliases: buildModelAliases(),
  /** strictModel=true 时，未知模型名直接 400（不静默映射），默认 false 保持兼容 */
  strictModel: process.env.STRICT_MODEL === 'true',

  // ---- 多模态视觉（MiniMax-VL 看图说话） ----
  miniMaxEndpoint: process.env.MINIMAX_ENDPOINT ?? 'https://api.minimax.io/v1/chat/completions',
  miniMaxModel: process.env.MINIMAX_VL_MODEL ?? 'MiniMax-VL-01',
  miniMaxApiKey: process.env.MINIMAX_API_KEY ?? '',
  miniMaxTimeoutMs: 10_000,

  // ---- 请求体与附件安全限制 ----
  maxBodyBytes: Number(process.env.CHAT_MAX_BODY_BYTES ?? 6 * 1024 * 1024), // 总请求体 ≤ 6MB
  maxAttachments: 5, // 附件数量 ≤ 5
  maxImageBase64Chars: 4 * 1024 * 1024, // 单张图 base64 长度 ≤ 4MB（约 3MB 原图）
  maxDocChars: 20_000, // 单个文档截断 2 万字符
  maxTotalDocChars: 60_000, // 全部文档合计 ≤ 6 万字符
  maxHistory: 40, // 历史消息 ≤ 40 条（防止 token 爆炸）
  maxHistoryChars: 120_000, // 历史总字符 ≤ 12 万

  // ---- 限流（单机内存版；多实例部署请换 Redis） ----
  rateLimit: {
    windowMs: Number(process.env.CHAT_RATE_WINDOW_MS ?? 60_000),
    max: Number(process.env.CHAT_RATE_MAX ?? 30), // 每 IP 每分钟 30 次
  },

  // ---- 可选入口令牌：设置后前端必须带 Authorization: Bearer <CHAT_API_TOKEN> ----
  chatApiToken: process.env.CHAT_API_TOKEN ?? '',
};

/** 系统提示词（可维护性：单独集中；可用 CHAT_SYSTEM_PROMPT_OVERRIDE 整体覆盖） */
const SYSTEM_PROMPT =
  process.env.CHAT_SYSTEM_PROMPT_OVERRIDE ??
  [
    '你是一个具备联网搜索能力、多模态视觉理解能力的通用 AI 智能体助手。',
    '你的应用场景包括但不限于陶瓷文化、饰品推荐、AI 影视创作、代码与 IT 技术、时事资讯、科学理论。',
    '当用户问到超出你知识范围、或需要实时资讯/最新数据的问题时，',
    '你**必须**发起 "web_search" 工具调用去查找外部信息，然后基于真实搜索结果给出详尽答案。',
    '**绝对不准**回复"超出我的能力范围"之类的拒绝话语。',
  ].join('');

/* ===========================================================================
 * 二、类型定义
 * ========================================================================= */

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** 经过消毒后的上游消息（OpenAI 兼容格式） */
type UpstreamMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; name: string; content: string };

interface Attachment {
  type?: string;
  base64?: string;
  text?: string;
  fileName?: string;
}

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/* ===========================================================================
 * 三、工具函数
 * ========================================================================= */

/** 生成请求 ID（日志追踪 / 错误响应带回） */
function makeRequestId(): string {
  return crypto.randomUUID();
}

/* ============================================================================
 * 站点上下文 —— 注入系统提示词，决定助手是"真能干"还是"看起来能干"
 * ----------------------------------------------------------------------------
 * 目录来自 lib/site-catalog.ts，条目全部对应仓库里真实存在的路由/接口。
 * 纪律部分不是客套话，而是三条具体的防幻觉约束：
 *   ① 不知道就先查 —— 目录里没有的，如实说没有
 *   ② 要数据就调工具 —— 商品、文章、余额一律拿真实结果
 *   ③ 工具失败就说失败 —— 不许把 ok:false 粉饰成成功
 * ========================================================================= */
const SITE_CONTEXT = `

【本网站服务目录（真实存在，不是设想中的功能）】
${catalogDigest()}

【工具使用纪律 · 必须遵守】
1. 任何涉及"本站能不能做某事"的问题，先调用 site_search 确认，不要凭印象回答。
   目录里没有的服务，如实告诉用户本站暂不提供，不要编造。
2. 涉及商品、文章、账户余额的问题，必须调用对应工具拿真实数据：
   search_product / search_blog / get_my_account。绝不要凭已有知识描述商品或余额。
3. 拿到路径后，主动询问"要不要我带你去"，用户同意后再调 navigate ——
   不要未经确认就跳转页面。path 只能用 site_search 返回的真实路径。
4. 超出普通对话能力的重任务（工程图纸解读、复杂代码生成、系统架构设计），
   调 open_harness 打开 Harness 主梁工作台，并说明为什么它更合适。
5. 工具返回 ok:false 时，把真实原因转述给用户，不要假装成功、也不要静默忽略。
6. 用户要翻译时调 translate_text 拿真实译文，不要自己"心译"后冒充翻译结果。`;

/** 结构化日志：生产运维只需 grep JSON */
function log(level: 'info' | 'warn' | 'error', requestId: string, event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    requestId,
    event,
    ...extra,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** 统一错误响应：稳定错误码 + requestId，前端可精确处理 */
function err(code: string, message: string, status: number, requestId: string) {
  return NextResponse.json({ success: false, code, message, requestId }, { status });
}

/** 取客户端真实 IP（兼容反代） */
function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip') || 'unknown';
}

/** 单机滑动窗口限流（多实例部署请替换为 Redis 实现） */
const rateBuckets = new Map<string, number[]>();
function rateLimitCheck(ip: string): { ok: boolean; retryAfterSec: number } {
  const { windowMs, max } = CFG.rateLimit;
  const now = Date.now();
  const arr = (rateBuckets.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    rateBuckets.set(ip, arr);
    const oldest = arr[0] ?? now;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) };
  }
  arr.push(now);
  rateBuckets.set(ip, arr);
  // 防内存泄漏：定期清理陈旧 IP 桶
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (v.length === 0 || now - (v[v.length - 1] ?? 0) > windowMs * 10) rateBuckets.delete(k);
    }
  }
  return { ok: true, retryAfterSec: 0 };
}

/** 校验请求体大小与 JSON 合法性 */
async function parseJsonBody(req: NextRequest, requestId: string) {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > CFG.maxBodyBytes) {
    return { error: err('ERR_TOO_LARGE', '请求体过大', 413, requestId) };
  }
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return { error: err('ERR_VALIDATION', '请求体必须是 JSON 对象', 400, requestId) };
    }
    return { body: body as Record<string, unknown> };
  } catch {
    return { error: err('ERR_VALIDATION', 'JSON 解析失败', 400, requestId) };
  }
}

/**
 * 历史消息消毒（核心安全点）：
 *  - 只允许 user / assistant / tool 三种角色；
 *  - 丢弃客户端注入的 system / developer 角色（防提示词劫持）；
 *  - 保留 assistant.tool_calls 与 tool.tool_call_id / name（工具回调闭环必需）；
 *  - 限制条数与总字符，防 token 成本爆炸。
 */
function sanitizeHistory(raw: unknown): { messages: UpstreamMessage[]; warnings: string[] } {
  const warnings: string[] = [];
  const out: UpstreamMessage[] = [];
  if (!Array.isArray(raw)) return { messages: out, warnings };

  let totalChars = 0;
  for (const m of raw.slice(0, CFG.maxHistory)) {
    if (!m || typeof m !== 'object') continue;
    const msg = m as Record<string, unknown>;
    const role = String(msg.role ?? '');

    if (role === 'user') {
      const content = String(msg.content ?? '').slice(0, 20_000);
      if (!content) continue;
      out.push({ role: 'user', content });
      totalChars += content.length;
    } else if (role === 'assistant') {
      const content = msg.content == null ? null : String(msg.content).slice(0, 20_000);
      const toolCalls = Array.isArray(msg.tool_calls)
        ? (msg.tool_calls as ToolCall[]).slice(0, 8).map((tc) => ({
            id: String(tc.id ?? '').slice(0, 128),
            type: 'function' as const,
            function: {
              name: String(tc.function?.name ?? '').slice(0, 128),
              arguments: String(tc.function?.arguments ?? '').slice(0, 8_000),
            },
          }))
        : undefined;
      if (content === null && (!toolCalls || toolCalls.length === 0)) continue; // 空 assistant 消息丢弃
      out.push({ role: 'assistant', content, ...(toolCalls && toolCalls.length ? { tool_calls: toolCalls } : {}) });
      totalChars += (content ?? '').length;
    } else if (role === 'tool') {
      const content = String(msg.content ?? '').slice(0, 20_000);
      const toolCallId = String(msg.tool_call_id ?? '').slice(0, 128);
      const name = String(msg.name ?? '').slice(0, 128);
      if (!toolCallId) {
        warnings.push('存在缺少 tool_call_id 的 tool 消息，已丢弃');
        continue;
      }
      out.push({ role: 'tool', tool_call_id: toolCallId, name, content });
      totalChars += content.length;
    } else {
      warnings.push(`已丢弃非法角色消息: ${role}`); // 含 system/developer 注入防护
    }

    if (totalChars > CFG.maxHistoryChars) {
      warnings.push('历史消息过长，已截断');
      break;
    }
  }
  return { messages: out, warnings };
}

/**
 * 附件处理：
 *  - 图片：交给 MiniMax-VL"看图说话"，产出描述文本注入系统提示词（带超时、失败降级）；
 *  - 文档：抽取文本做 RAG 注入（单篇/总量双重截断）。
 */
async function processAttachments(raw: unknown, requestId: string): Promise<{ systemExtra: string; warnings: string[] }> {
  const warnings: string[] = [];
  let imageDescription = '';
  let documentContext = '';

  if (!Array.isArray(raw) || raw.length === 0) return { systemExtra: '', warnings };

  const attachments = (raw as Attachment[]).slice(0, CFG.maxAttachments);
  if (raw.length > CFG.maxAttachments) warnings.push(`附件超过 ${CFG.maxAttachments} 个，已截断`);

  // ---- 图片：仅接受一张，且必须是合法 data URL ----
  const image = attachments.find(
    (a) => a?.type === 'image' && typeof a.base64 === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(a.base64 ?? ''),
  );
  if (image?.base64) {
    if (image.base64.length > CFG.maxImageBase64Chars) {
      warnings.push('图片过大，已跳过图片理解');
    } else {
      imageDescription = await analyzeImage(image.base64, requestId, warnings);
    }
  } else if (attachments.some((a) => a?.type === 'image')) {
    warnings.push('存在无法识别的图片附件，已忽略');
  }

  // ---- 文档：抽取文本并截断 ----
  const docs = attachments.filter((a) => a?.type === 'document' && typeof a.text === 'string' && a.text.length > 0);
  if (docs.length > 0) {
    let total = 0;
    const parts: string[] = [];
    for (const [i, d] of docs.entries()) {
      const text = (d.text ?? '').slice(0, CFG.maxDocChars);
      if (!text) continue;
      total += text.length;
      if (total > CFG.maxTotalDocChars) {
        warnings.push('文档内容过长，超出部分已截断');
        break;
      }
      parts.push(`[文档${i + 1}: ${d.fileName || '未命名'}]\n${text}`);
    }
    if (parts.length) {
      documentContext = '\n\n--- 用户上传的文档内容（请基于此内容回答问题）---\n' + parts.join('\n\n') + '\n--- 文档内容结束 ---';
    }
  }

  const systemExtra =
    (imageDescription ? `\n\n[AI 图片分析结果]: ${imageDescription}` : '') + documentContext;
  log('info', requestId, 'attachments_processed', { images: image ? 1 : 0, docs: docs.length, warnings });
  return { systemExtra, warnings };
}

/** 调用 MiniMax-VL 做图片描述（带超时；失败降级为占位文案，不阻塞主流程） */
async function analyzeImage(base64: string, requestId: string, warnings: string[]): Promise<string> {
  if (!CFG.miniMaxApiKey) {
    warnings.push('未配置 MINIMAX_API_KEY，图片理解已跳过');
    return '';
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CFG.miniMaxTimeoutMs);
  try {
    const res = await fetch(CFG.miniMaxEndpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CFG.miniMaxApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CFG.miniMaxModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '请用一句话简要描述这张图片的内容，以便我可以向另一个AI系统传达它的关键信息。' },
              { type: 'image_url', image_url: { url: base64 } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      log('warn', requestId, 'minimax_http_error', { status: res.status });
      warnings.push('图片理解服务暂时不可用');
      return '';
    }
    const data = await res.json();
    return String(data?.choices?.[0]?.message?.content ?? '').slice(0, 1_000) || '';
  } catch (e) {
    log('warn', requestId, 'minimax_failed', { error: (e as Error)?.message });
    warnings.push('图片理解服务暂时不可用');
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/** 模型解析：别名 → 上游真实模型；strictMode 下未知模型报错 */
function resolveModel(raw: unknown): { model: string; warnings: string[] } {
  const warnings: string[] = [];
  const name = raw == null ? '' : String(raw);
  if (name && CFG.modelAliases[name]) {
    const real = CFG.modelAliases[name];
    if (real !== name) warnings.push(`模型 ${name} 已映射到 ${real}（上游暂未开通）`);
    return { model: real, warnings };
  }
  if (name && CFG.strictModel) {
    throw new Error(`不支持的模型: ${name}`);
  }
  if (name) warnings.push(`未知模型 ${name}，已回退默认模型`);
  return { model: CFG.defaultModel, warnings };
}

/** 调用上游（网络层失败最多重试 maxRetries 次；HTTP 错误不重试避免重复计费） */
/**
 * 单次 POST，含网络层重试（HTTP 错误不重试，避免重复计费）。
 * 网络层彻底失败会 throw；HTTP 非 2xx 返回 { ok:false } 交给调用方决定要不要兜底。
 */
async function postJson(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  requestId: string,
  tag: string,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < CFG.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, json };
    } catch (e) {
      lastErr = e;
      const isTimeout = (e as Error)?.name === 'AbortError';
      log('warn', requestId, 'upstream_retry', { tag, attempt, timeout: isTimeout, error: (e as Error)?.message });
      if (attempt < CFG.maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${tag} 调用失败`);
}

/**
 * 把 Hermes 命名空间的模型 ID 翻译成 DeepSeek 官方 ID。
 *   deepseek/deepseek-v4-pro   → deepseek-v4-pro
 *   deepseek/deepseek-flash    → deepseek-flash
 *   gpt-6-sol / 其它未知        → deepseek-v4-pro（官方只有两个模型，兜底取旗舰）
 */
function toOfficialModel(model: unknown): string {
  const m = String(model ?? '').trim();
  const bare = m.includes('/') ? m.slice(m.lastIndexOf('/') + 1) : m;
  if (bare === 'deepseek-v4-pro' || bare === 'deepseek-flash') return bare;
  if (bare === 'deepseek-v4-flash') return 'deepseek-flash'; // 实测官方会把它回落成 flash，直接写对
  return 'deepseek-v4-pro';
}

/**
 * 调用上游：先走 Hermes 网关，失败则自动切换 DeepSeek 官方兜底通道。
 *
 * 为什么要有兜底：Hermes 网关会整体 502，而助手的全部工具调用能力都依赖这条链路。
 * 兜底只在主通道【明确失败】后才触发一次，正常路径零影响。
 */
async function callUpstream(
  body: Record<string, unknown>,
  requestId: string,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  let primary: { ok: boolean; status: number; json: unknown } | null = null;
  let primaryErr: unknown = null;

  try {
    primary = await postJson(CFG.upstream, CFG.upstreamApiKey, body, CFG.timeoutMs, requestId, 'hermes');
    if (primary.ok) return primary;
  } catch (e) {
    primaryErr = e;
  }

  // ---- 兜底 ----
  if (CFG.fallbackApiKey) {
    const status = primary ? primary.status : 'NETWORK_ERROR';
    log('warn', requestId, 'upstream_fallback', { primaryStatus: status });
    try {
      const fb = await postJson(
        CFG.fallbackUpstream,
        CFG.fallbackApiKey,
        { ...body, model: toOfficialModel(body.model) },
        CFG.fallbackTimeoutMs,
        requestId,
        'deepseek-official',
      );
      if (fb.ok) {
        log('info', requestId, 'upstream_fallback_ok', { status: fb.status });
        return { ...fb, json: { ...(fb.json as Record<string, unknown>), _channel: 'deepseek-official' } };
      }
      log('error', requestId, 'upstream_fallback_failed', { status: fb.status });
    } catch (e) {
      log('error', requestId, 'upstream_fallback_threw', { error: (e as Error)?.message });
    }
  }

  // 两条都不通：抛出主通道的错误（更能反映真实问题），没有主通道错误就抛兜底的
  if (primary) return primary;
  throw primaryErr instanceof Error ? primaryErr : new Error('上游调用失败');
}

/* ===========================================================================
 * 四、主路由
 * ========================================================================= */

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const startedAt = Date.now();

  // ---- 限流（先于一切业务逻辑） ----
  const ip = getClientIp(req);
  const rl = rateLimitCheck(ip);
  if (!rl.ok) {
    log('warn', requestId, 'rate_limited', { ip });
    return err('ERR_RATE_LIMITED', '请求过于频繁，请稍后再试', 429, requestId);
  }

  // ---- 可选入口令牌校验（fail-closed：配置了就必须带对） ----
  if (CFG.chatApiToken) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${CFG.chatApiToken}`) {
      log('warn', requestId, 'auth_failed', { ip });
      return err('ERR_AUTH', '无效的访问令牌', 401, requestId);
    }
  }

  // ---- 解析与校验请求体 ----
  const parsed = await parseJsonBody(req, requestId);
  if (parsed.error) return parsed.error;
  const body = parsed.body!;

  const rawMessage = body.message;
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
  const history = sanitizeHistory(body.history);
  const warnings = [...history.warnings];

  // 工具回调第二轮允许 message 为空（关键信息在 history 的 tool 消息里）
  const hasToolTurn = history.messages.some((m) => m.role === 'tool');
  if (!message && !hasToolTurn) {
    return err('ERR_VALIDATION', '缺少 message 参数', 400, requestId);
  }

  // ---- 模型解析 ----
  let model: string;
  try {
    const resolved = resolveModel(body.model);
    model = resolved.model;
    warnings.push(...resolved.warnings);
  } catch (e) {
    return err('ERR_VALIDATION', (e as Error).message, 400, requestId);
  }

  // ---- 附件处理（图片理解 + 文档 RAG） ----
  const { systemExtra, warnings: attachWarnings } = await processAttachments(body.attachments, requestId);
  warnings.push(...attachWarnings);

  // ---- 组装上游消息 ----
  // SITE_CONTEXT 让模型先"知道本站有什么"；工具则让它"能去查、能去操作"。
  // 两者缺一不可：只有目录会答得笼统，只有工具会乱调。
  const messages: UpstreamMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT + systemExtra + SITE_CONTEXT },
    ...history.messages,
  ];
  if (message) messages.push({ role: 'user', content: message });

  const upstreamBody: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.7,
    max_tokens: Number(process.env.CHAT_MAX_TOKENS ?? 4000),
    // 工具清单来自 lib/site-tools.ts（唯一事实来源）。
    // 改版前这里硬编码了 web_search / search_product 两条，其中 search_product
    // 前端从未实现执行分支 —— 模型调了也白调，等于给了它一个幻觉的来源。
    tools: toolSchemasForUpstream(),
    tool_choice: 'auto',
  };

  // ---- 可选：SSE 流式模式（前端需传 stream: true 并解析 OpenAI 兼容 SSE） ----
  if (body.stream === true) {
    return handleStreaming(req, requestId, upstreamBody, model);
  }

  // ---- 非流式：完整响应 + 工具调用拦截 ----
  const upstream = await callUpstream(upstreamBody, requestId);
  const data = upstream.json as {
    choices?: Array<{ message?: { role?: string; content?: string | null; tool_calls?: ToolCall[] } }>;
    usage?: Usage;
  } | null;

  if (!upstream.ok) {
    log('error', requestId, 'upstream_http_error', {
      status: upstream.status,
      upstreamDetail: JSON.stringify(upstream.json ?? null).slice(0, 1000), // 明细只进日志，不回传前端
    });
    return err('ERR_UPSTREAM', '模型服务暂时不可用，请稍后重试', 502, requestId);
  }

  const choice = data?.choices?.[0]?.message;
  const usage = data?.usage ?? null;
  const latencyMs = Date.now() - startedAt;

  // 工具调用：原样返回给前端执行（前端执行完后把结果以 tool 消息回传，见 sanitizeHistory）
  if (choice?.tool_calls && choice.tool_calls.length > 0) {
    log('info', requestId, 'tool_calls_returned', { model, latencyMs, toolNames: choice.tool_calls.map((t) => t.function?.name), usage });
    return NextResponse.json({
      success: true,
      tool_calls: choice.tool_calls,
      role: choice.role || 'assistant',
      is_tool_call: true, // 兼容现有前端识别标记
      model_used: model,
      usage,
      warnings,
      requestId,
    });
  }

  const reply = choice?.content?.trim() || '（模型返回了空的思考结果）';
  log('info', requestId, 'chat_reply', { model, latencyMs, chars: reply.length, usage });
  return NextResponse.json({
    success: true,
    reply,
    model_used: model,
    usage,
    warnings,
    requestId,
  });
}

/* ===========================================================================
 * 五、SSE 流式输出（生产级聊天体验；前端 opt-in）
 * 契约：Content-Type: text/event-stream，逐行转发上游 OpenAI 兼容 SSE；
 *       结尾追加 data: {"coupiya_done":true,"requestId":"..."}。
 * 注意：流式模式下 tool_calls 以增量 delta 形式出现，前端需自行聚合；
 *       若前端没有 SSE 解析能力，请保持默认 stream:false 走 JSON 模式。
 * ========================================================================= */

async function handleStreaming(
  _req: NextRequest,
  requestId: string,
  upstreamBody: Record<string, unknown>,
  model: string,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (CFG.upstreamApiKey) headers['Authorization'] = `Bearer ${CFG.upstreamApiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CFG.timeoutMs);
  try {
    const res = await fetch(CFG.upstream, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...upstreamBody, stream: true, stream_options: { include_usage: true } }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      log('error', requestId, 'stream_start_failed', { status: res.status });
      return NextResponse.json(
        { success: false, code: 'ERR_UPSTREAM', message: '模型流式服务暂时不可用', requestId },
        { status: 502 },
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = res.body.getReader();

    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            ctrl.enqueue(encoder.encode(decoder.decode(value, { stream: true })));
          }
          // 结尾补充平台元数据事件
          ctrl.enqueue(
            encoder.encode(`data: ${JSON.stringify({ coupiya_done: true, model_used: model, requestId })}\n\n`),
          );
        } catch (e) {
          log('error', requestId, 'stream_interrupted', { error: (e as Error)?.message });
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ coupiya_error: 'stream_interrupted', requestId })}\n\n`));
        } finally {
          try { ctrl.close(); } catch { /* 已关闭 */ }
        }
      },
    });

    log('info', requestId, 'stream_started', { model });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    const isTimeout = (e as Error)?.name === 'AbortError';
    log('error', requestId, 'stream_failed', { timeout: isTimeout, error: (e as Error)?.message });
    return NextResponse.json(
      {
        success: false,
        code: isTimeout ? 'ERR_TIMEOUT' : 'ERR_UPSTREAM',
        message: isTimeout ? '模型响应超时' : '模型服务连接失败',
        requestId,
      },
      { status: 504 },
    );
  } finally {
    clearTimeout(timer);
  }
}
