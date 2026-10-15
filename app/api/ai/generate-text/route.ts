// ============================================================================
// app/api/ai/generate-text/route.ts —— 全球生产级 AI 文本创作网关（瓷韵文案助手）
// ----------------------------------------------------------------------------
// 职责：接收创作提示 → 调用 DeepSeek 生成文化/陶瓷文案 → 返回文本 + token 用量
//
// 相对原版的全部升级：
//   - 生产环境缺失 Key 时【fail-closed】返回错误，绝不静默吐"模拟文本"糊弄全球用户
//     （模拟文本仅限开发环境，且需显式 ALLOW_MOCK_TEXT=true 才启用）
//   - 每 IP 限流（免费功能消耗平台 DeepSeek 额度，必须防护）
//   - 全链路 requestId + JSON 结构化日志（含 usage，为计费/对账留数据）
//   - 上游调用带超时 + 网络层失败重试一次（HTTP 错误不重试，避免重复计费）
//   - prompt 长度/非空校验 + 请求体大小限制
//   - 统一错误码 ERR_*，与 chat / generate 系列同一套契约
//   - 系统提示词可通过 TEXT_SYSTEM_PROMPT 环境变量覆盖
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { deepseekOfficialModel } from '@/lib/ai-models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* ===========================================================================
 * 一、配置中心
 * ========================================================================= */

const CFG = {
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekEndpoint: process.env.DEEPSEEK_ENDPOINT ?? 'https://api.deepseek.com/v1/chat/completions',
  deepseekModel: deepseekOfficialModel(),
  timeoutMs: Number(process.env.TEXT_TIMEOUT_MS ?? 30_000),
  maxRetries: 2, // 仅网络层失败重试

  maxPromptChars: Number(process.env.TEXT_PROMPT_MAX_CHARS ?? 2000),
  maxOutputTokens: Number(process.env.TEXT_MAX_TOKENS ?? 800),
  temperature: Number(process.env.TEXT_TEMPERATURE ?? 0.8),
  maxBodyBytes: 64 * 1024,

  rateLimit: {
    windowMs: Number(process.env.TEXT_RATE_WINDOW_MS ?? 60_000),
    max: Number(process.env.TEXT_RATE_MAX ?? 20), // 每 IP 每分钟 20 次
  },

  // 模拟模式：仅当非生产环境 且 显式开启时可用
  isProduction: process.env.NODE_ENV === 'production',
  allowMock: process.env.ALLOW_MOCK_TEXT === 'true',
};

/** 瓷韵文案助手系统提示词（可用 TEXT_SYSTEM_PROMPT 覆盖） */
const SYSTEM_PROMPT =
  process.env.TEXT_SYSTEM_PROMPT ??
  [
    '你是一个专业的中国传统文化与陶瓷艺术文案创作助手。',
    '请根据用户的提示，生成优美、有吸引力且富有文化底蕴的文本（可以是营销文案、产品介绍、诗歌或短文）。',
    '直接输出创作结果，不要输出多余解释。',
  ].join('');

/* ===========================================================================
 * 二、工具函数
 * ========================================================================= */

function makeRequestId(): string {
  return crypto.randomUUID();
}

function log(level: 'info' | 'warn' | 'error', requestId: string, event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'generate-text', requestId, event, ...extra });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function err(code: string, message: string, status: number, requestId: string) {
  return NextResponse.json({ success: false, code, message, requestId }, { status });
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip') || 'unknown';
}

const rateBuckets = new Map<string, number[]>();
function rateLimitCheck(ip: string): { ok: boolean; retryAfterSec: number } {
  const { windowMs, max } = CFG.rateLimit;
  const key = `text:${ip}`;
  const now = Date.now();
  const arr = (rateBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    rateBuckets.set(key, arr);
    const oldest = arr[0] ?? now;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) };
  }
  arr.push(now);
  rateBuckets.set(key, arr);
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (v.length === 0 || now - (v[v.length - 1] ?? 0) > windowMs * 10) rateBuckets.delete(k);
    }
  }
  return { ok: true, retryAfterSec: 0 };
}

async function parseJsonBody(req: NextRequest, requestId: string) {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > CFG.maxBodyBytes) return { error: err('ERR_TOO_LARGE', '请求体过大', 413, requestId) };
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object') return { error: err('ERR_VALIDATION', '请求体必须是 JSON 对象', 400, requestId) };
    return { body: body as Record<string, unknown> };
  } catch {
    return { error: err('ERR_VALIDATION', 'JSON 解析失败', 400, requestId) };
  }
}

/** 校验并清理创作提示词 */
function sanitizePrompt(raw: unknown): { prompt: string; error?: ReturnType<typeof err> } {
  if (typeof raw !== 'string') return { prompt: '', error: err('ERR_VALIDATION', '缺少 prompt 参数', 400, makeRequestId()) };
  const prompt = raw.replace(/\s+/g, ' ').trim();
  if (!prompt) return { prompt: '', error: err('ERR_VALIDATION', 'prompt 不能为空', 400, makeRequestId()) };
  return { prompt: prompt.slice(0, CFG.maxPromptChars) };
}

/** 调用 DeepSeek（网络层失败最多重试 maxRetries 次；带超时） */
async function callDeepSeek(
  prompt: string,
  requestId: string,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < CFG.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CFG.timeoutMs);
    try {
      const res = await fetch(CFG.deepseekEndpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CFG.deepseekApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: CFG.deepseekModel,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          max_tokens: CFG.maxOutputTokens,
          temperature: CFG.temperature,
        }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, json };
    } catch (e) {
      lastErr = e;
      const isTimeout = (e as Error)?.name === 'AbortError';
      log('warn', requestId, 'deepseek_retry', { attempt, timeout: isTimeout, error: (e as Error)?.message });
      if (attempt < CFG.maxRetries - 1) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('DeepSeek 调用失败');
}

/* ===========================================================================
 * 三、主路由
 * ========================================================================= */

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const startedAt = Date.now();

  // ---- 限流（先于一切） ----
  const rl = rateLimitCheck(getClientIp(req));
  if (!rl.ok) {
    log('warn', requestId, 'rate_limited', { ip: getClientIp(req) });
    return err('ERR_RATE_LIMITED', '请求过于频繁，请稍后再试', 429, requestId);
  }

  // ---- 解析与校验 ----
  const parsed = await parseJsonBody(req, requestId);
  if (parsed.error) return parsed.error;
  const body = parsed.body!;

  const { prompt, error } = sanitizePrompt(body.prompt);
  if (error) return error;

  log('info', requestId, 'text_start', { promptLen: prompt.length });

  // ---- 密钥缺失：生产环境 fail-closed，绝不静默返回模拟文本 ----
  if (!CFG.deepseekApiKey) {
    if (CFG.isProduction || !CFG.allowMock) {
      log('error', requestId, 'missing_key_fail_closed', { isProduction: CFG.isProduction });
      return err('ERR_UPSTREAM_AUTH', '文本生成服务暂未配置，请稍后再试', 503, requestId);
    }
    // 仅开发环境 + 显式开启时返回模拟文本（标注 mock 便于排查）
    log('warn', requestId, 'text_mock_mode');
    return NextResponse.json({
      success: true,
      text: `[模拟文本-开发模式] 输入提示词为：${prompt}`,
      mock: true,
      requestId,
    });
  }

  // ---- 调用 DeepSeek ----
  let upstream;
  try {
    upstream = await callDeepSeek(prompt, requestId);
  } catch (e) {
    log('error', requestId, 'deepseek_unreachable', { error: (e as Error)?.message });
    return err('ERR_UPSTREAM', '文本生成服务暂时不可用', 502, requestId);
  }

  const data = upstream.json as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  } | null;

  if (!upstream.ok) {
    log('error', requestId, 'deepseek_http_error', {
      status: upstream.status,
      upstreamDetail: JSON.stringify(upstream.json ?? null).slice(0, 1000), // 明细只进日志
    });
    return err('ERR_UPSTREAM', '文本生成服务暂时不可用，请稍后重试', 502, requestId);
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    log('warn', requestId, 'deepseek_empty_reply');
    return err('ERR_UPSTREAM', '模型返回空结果，请重试', 502, requestId);
  }

  const usage = data?.usage ?? null;
  log('info', requestId, 'text_ok', { chars: text.length, usage, latencyMs: Date.now() - startedAt });

  return NextResponse.json({
    success: true,
    text,
    model_used: CFG.deepseekModel,
    usage,
    requestId,
  });
}
