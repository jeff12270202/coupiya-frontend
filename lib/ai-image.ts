// ============================================================================
// lib/ai-image.ts —— AI 生图网关共享引擎（generate / generate-anime / generate-image 共用）
// ----------------------------------------------------------------------------
// 为什么抽共享库：三个生图路由原为复制粘贴的三份代码（90% 重复），
// 任何修复（超时/限流/校验/COS 持久化）都要改 3 遍，迟早出事故。
// 现在：每个路由只需 ~15 行配置，本文件统一承载全部生产级能力：
//
//   1. requestId + JSON 结构化日志（含命名空间，跨路由可追踪）
//   2. 每 IP 滑动窗口限流（命名空间隔离）
//   3. 所有上游调用带超时（AbortController），杜绝永久挂起
//   4. prompt / width / height 严格校验与钳制（防 99999 打爆服务）
//   5. 图片可选落地腾讯云 COS 持久化（密钥兼容 SECRET_ID/SECRET_KEY）
//   6. 四层降级：DeepSeek 优化 → Pollinations → Replicate → HuggingFace → 内联 SVG 占位图
//   7. 统一错误码 ERR_* 与稳定响应结构 { success, imageUrl, provider, warnings, requestId }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { deepseekOfficialModel } from '@/lib/ai-models';

/* ===========================================================================
 * 一、配置（全部支持环境变量覆盖）
 * ========================================================================= */

const CFG = {
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekEndpoint: process.env.DEEPSEEK_ENDPOINT ?? 'https://api.deepseek.com/v1/chat/completions',
  deepseekModel: deepseekOfficialModel(),
  deepseekTimeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 15_000),

  pollinationsBase: process.env.POLLINATIONS_BASE ?? 'https://image.pollinations.ai/prompt',
  pollinationsTimeoutMs: Number(process.env.POLLINATIONS_TIMEOUT_MS ?? 60_000),

  replicateApiKey: process.env.REPLICATE_API_KEY ?? '',
  replicateVersion:
    process.env.REPLICATE_SDXL_VERSION ??
    'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
  replicateFetchTimeoutMs: Number(process.env.REPLICATE_FETCH_TIMEOUT_MS ?? 15_000),

  hfApiKey: process.env.HUGGINGFACE_API_KEY ?? '',
  hfTimeoutMs: Number(process.env.HF_TIMEOUT_MS ?? 60_000),
  hfMaxRetries: Number(process.env.HF_MAX_RETRIES ?? 3), // HF 冷启动 503 重试

  maxPromptChars: Number(process.env.AI_PROMPT_MAX_CHARS ?? 2000),
  minPromptChars: 1,
  minDim: 256,
  maxDim: 2048,
  maxImageBytes: 15 * 1024 * 1024,
  maxBodyBytes: 64 * 1024,

  rateLimit: {
    windowMs: Number(process.env.GEN_RATE_WINDOW_MS ?? 60_000),
    max: Number(process.env.GEN_RATE_MAX ?? 10),
  },

  // COS 持久化：兼容 COS_SECRET_ID 或现有 SECRET_ID 变量名
  cos: {
    secretId: process.env.COS_SECRET_ID || process.env.SECRET_ID || '',
    secretKey: process.env.COS_SECRET_KEY || process.env.SECRET_KEY || '',
    bucket: process.env.COS_BUCKET || '',
    region: process.env.COS_REGION || '',
  },
};

/* ===========================================================================
 * 二、路由级配置（每个生图路由通过 createImageGenHandler 传入）
 * ========================================================================= */

export interface CreateImageGenOptions {
  /** 限流命名空间与日志服务名（如 'gen' / 'anime' / 'gen-image'） */
  namespace: string;
  /** 默认尺寸（方图：512 / 1024） */
  defaultDim?: number;
  /** 终极占位图文字 */
  placeholderText: string;
  /** DeepSeek 提示词系统提示词 */
  promptSystem: string;
  /** 可选：从指定环境变量读取系统提示词覆盖（如 ANIME_PROMPT_OVERRIDE） */
  promptSystemEnv?: string;
  /** HuggingFace 兜底模型端点 */
  hfEndpoint: string;
  /** COS 对象前缀（如 ai-images / ai-anime） */
  cosKeyPrefix: string;
  /** Replicate 轮询次数（默认 30 次 × 2s ≈ 60s） */
  replicatePollAttempts?: number;
  /** DeepSeek 优化输出上限 token（默认 300） */
  deepseekMaxTokens?: number;
}

/* ===========================================================================
 * 三、工具函数
 * ========================================================================= */

function makeRequestId(): string {
  return crypto.randomUUID();
}

function log(namespace: string, level: 'info' | 'warn' | 'error', requestId: string, event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: namespace, requestId, event, ...extra });
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
function rateLimitCheck(namespace: string, ip: string): { ok: boolean; retryAfterSec: number } {
  const { windowMs, max } = CFG.rateLimit;
  const key = `${namespace}:${ip}`;
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

function clampDim(raw: unknown, fallback: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(CFG.maxDim, Math.max(CFG.minDim, n));
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

function sanitizePrompt(raw: unknown): { prompt: string; error?: ReturnType<typeof err> } {
  if (typeof raw !== 'string') return { prompt: '', error: err('ERR_VALIDATION', '缺少 prompt 参数', 400, makeRequestId()) };
  const prompt = raw.replace(/\s+/g, ' ').trim();
  if (prompt.length < CFG.minPromptChars) {
    return { prompt: '', error: err('ERR_VALIDATION', 'prompt 不能为空', 400, makeRequestId()) };
  }
  return { prompt: prompt.slice(0, CFG.maxPromptChars) };
}

function placeholderSvg(w: number, h: number, text: string): string {
  const fontSize = Math.max(14, Math.round(w / 14));
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>` +
    `<rect width='100%' height='100%' fill='#f472b6'/>` +
    `<text x='50%' y='50%' fill='white' font-family='Arial' font-size='${fontSize}' text-anchor='middle' dominant-baseline='middle'>${text}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function downloadImage(url: string, timeoutMs: number, requestId: string, namespace: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) {
      log(namespace, 'warn', requestId, 'download_not_ok', { status: res.status, url: url.slice(0, 120) });
      return null;
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType && !contentType.startsWith('image/')) {
      log(namespace, 'warn', requestId, 'download_bad_content_type', { contentType });
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > CFG.maxImageBytes) {
      log(namespace, 'warn', requestId, 'download_bad_size', { bytes: buffer.length });
      return null;
    }
    return { buffer, contentType };
  } catch (e) {
    log(namespace, 'warn', requestId, 'download_failed', { error: (e as Error)?.message });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** COS 持久化（动态导入 SDK；未配置/未安装自动跳过） */
async function uploadToCos(buffer: Buffer, contentType: string, keyPrefix: string, requestId: string, namespace: string): Promise<string | null> {
  const { secretId, secretKey, bucket, region } = CFG.cos;
  if (!secretId || !secretKey || !bucket || !region) return null;
  try {
    const mod = await import('cos-nodejs-sdk-v5');
    const COS = (mod.default ?? mod) as unknown as new (opts: { SecretId: string; SecretKey: string }) => {
      putObject: (params: Record<string, unknown>, cb: (err: Error | null) => void) => void;
    };
    const cos = new COS({ SecretId: secretId, SecretKey: secretKey });
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const key = `${keyPrefix}/${requestId}.${ext}`;
    await new Promise<void>((resolve, reject) => {
      cos.putObject(
        { Bucket: bucket, Region: region, Key: key, Body: buffer, ContentType: contentType || 'image/jpeg' },
        (e) => (e ? reject(e) : resolve()),
      );
    });
    const url = `https://${bucket}.cos.${region}.myqcloud.com/${key}`;
    log(namespace, 'info', requestId, 'cos_uploaded', { url });
    return url;
  } catch (e) {
    log(namespace, 'warn', requestId, 'cos_upload_failed', { error: (e as Error)?.message });
    return null;
  }
}

async function finalizeImage(
  buffer: Buffer | null,
  remoteUrl: string,
  contentType: string,
  keyPrefix: string,
  requestId: string,
  namespace: string,
  warnings: string[],
): Promise<{ imageUrl: string; warnings: string[] }> {
  if (buffer) {
    const cosUrl = await uploadToCos(buffer, contentType, keyPrefix, requestId, namespace);
    if (cosUrl) return { imageUrl: cosUrl, warnings };
  }
  warnings.push('图片为临时链接，建议尽快保存或启用 COS 持久化');
  return { imageUrl: remoteUrl, warnings };
}

async function pollReplicate(predictionId: string, attempts: number, requestId: string, namespace: string): Promise<{ output: unknown; status: string } | null> {
  const intervalMs = 2000;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CFG.replicateFetchTimeoutMs);
    try {
      const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { Authorization: `Token ${CFG.replicateApiKey}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        log(namespace, 'warn', requestId, 'replicate_poll_http', { status: res.status, attempt });
        await sleep(intervalMs);
        continue;
      }
      const data = await res.json();
      const status = String(data?.status ?? '');
      if (status === 'succeeded') return { output: data?.output, status };
      if (status === 'failed' || status === 'canceled') return { output: null, status };
      await sleep(intervalMs);
    } catch (e) {
      log(namespace, 'warn', requestId, 'replicate_poll_error', { attempt, error: (e as Error)?.message });
      await sleep(intervalMs);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ===========================================================================
 * 四、各层实现（参数化）
 * ========================================================================= */

async function optimizePrompt(
  prompt: string,
  system: string,
  maxTokens: number,
  requestId: string,
  namespace: string,
): Promise<{ optimized: string | null; usage: unknown } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CFG.deepseekTimeoutMs);
  try {
    const res = await fetch(CFG.deepseekEndpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CFG.deepseekApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CFG.deepseekModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      log(namespace, 'warn', requestId, 'deepseek_http', { status: res.status });
      return null;
    }
    const data = await res.json();
    const optimized = String(data?.choices?.[0]?.message?.content ?? '')
      .replace(/^["'\s]+|["'\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, CFG.maxPromptChars);
    if (!optimized) return null;
    return { optimized, usage: data?.usage ?? null };
  } catch (e) {
    log(namespace, 'warn', requestId, 'deepseek_failed', { error: (e as Error)?.message });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function generateViaReplicate(
  prompt: string,
  width: number,
  height: number,
  attempts: number,
  keyPrefix: string,
  requestId: string,
  namespace: string,
  warnings: string[],
): Promise<string | null> {
  try {
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { Authorization: `Token ${CFG.replicateApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: CFG.replicateVersion,
        input: { prompt, width: Math.min(1024, width), height: Math.min(1024, height) },
      }),
      signal: AbortSignal.timeout(CFG.replicateFetchTimeoutMs),
    });
    if (!createRes.ok) {
      log(namespace, 'warn', requestId, 'replicate_create_http', { status: createRes.status });
      return null;
    }
    const pred = await createRes.json();
    if (!pred?.id) return null;
    const result = await pollReplicate(pred.id, attempts, requestId, namespace);
    if (!result || result.status !== 'succeeded') {
      log(namespace, 'warn', requestId, 'replicate_not_succeeded', { status: result?.status ?? 'timeout' });
      return null;
    }
    const remoteUrl = Array.isArray(result.output) ? String(result.output[0] ?? '') : String(result.output ?? '');
    if (!remoteUrl.startsWith('http')) return null;
    const img = await downloadImage(remoteUrl, CFG.replicateFetchTimeoutMs, requestId, namespace);
    const { imageUrl } = await finalizeImage(img?.buffer ?? null, remoteUrl, img?.contentType ?? 'image/jpeg', keyPrefix, requestId, namespace, warnings);
    return imageUrl;
  } catch (e) {
    log(namespace, 'warn', requestId, 'replicate_failed', { error: (e as Error)?.message });
    return null;
  }
}

async function generateViaHuggingFace(
  prompt: string,
  hfEndpoint: string,
  requestId: string,
  namespace: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  for (let attempt = 0; attempt < CFG.hfMaxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CFG.hfTimeoutMs);
    try {
      const res = await fetch(hfEndpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CFG.hfApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: prompt }),
        signal: controller.signal,
      });
      if (res.status === 503) {
        log(namespace, 'info', requestId, 'hf_cold_start_retry', { attempt });
        await sleep(3000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        log(namespace, 'warn', requestId, 'hf_http', { status: res.status, attempt });
        return null;
      }
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0 || buffer.length > CFG.maxImageBytes) {
        log(namespace, 'warn', requestId, 'hf_bad_size', { bytes: buffer.length });
        return null;
      }
      return { buffer, contentType };
    } catch (e) {
      log(namespace, 'warn', requestId, 'hf_failed', { attempt, error: (e as Error)?.message });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/* ===========================================================================
 * 五、工厂：生成标准 POST 处理器（每个生图路由一行调用）
 * ========================================================================= */

export function createImageGenHandler(opts: CreateImageGenOptions) {
  const namespace = opts.namespace;
  const defaultDim = opts.defaultDim ?? 512;
  const promptSystem = opts.promptSystemEnv
    ? (process.env[opts.promptSystemEnv] ?? opts.promptSystem)
    : opts.promptSystem;
  const pollAttempts = opts.replicatePollAttempts ?? 30;
  const dsMaxTokens = opts.deepseekMaxTokens ?? 300;

  return async function POST(req: NextRequest) {
    const requestId = makeRequestId();
    const startedAt = Date.now();
    const warnings: string[] = [];

    // ---- 限流 ----
    const rl = rateLimitCheck(namespace, getClientIp(req));
    if (!rl.ok) return err('ERR_RATE_LIMITED', '请求过于频繁，请稍后再试', 429, requestId);

    // ---- 解析与校验 ----
    const parsed = await parseJsonBody(req, requestId);
    if (parsed.error) return parsed.error;
    const body = parsed.body!;

    const { prompt, error } = sanitizePrompt(body.prompt);
    if (error) return error;
    const width = clampDim(body.width, defaultDim);
    const height = clampDim(body.height, defaultDim);

    log(namespace, 'info', requestId, 'generate_start', { promptLen: prompt.length, width, height });

    // ---- 第一层：DeepSeek 提示词优化（可选） ----
    let finalPrompt = prompt;
    if (CFG.deepseekApiKey) {
      const ds = await optimizePrompt(prompt, promptSystem, dsMaxTokens, requestId, namespace);
      if (ds?.optimized) {
        finalPrompt = ds.optimized;
        log(namespace, 'info', requestId, 'deepseek_optimized', { usage: ds.usage });
      } else {
        warnings.push('提示词优化服务暂不可用，已使用原始提示词');
      }
    }

    // ---- 第二层：Pollinations（免费首选） ----
    const pollUrl =
      `${CFG.pollinationsBase}/${encodeURIComponent(finalPrompt)}` +
      `?width=${width}&height=${height}&nologin=true&seed=${Math.floor(Math.random() * 1_000_000)}`;
    const pollImage = await downloadImage(pollUrl, CFG.pollinationsTimeoutMs, requestId, namespace);
    if (pollImage) {
      const { imageUrl, warnings: w } = await finalizeImage(pollImage.buffer, pollUrl, pollImage.contentType, opts.cosKeyPrefix, requestId, namespace, warnings);
      log(namespace, 'info', requestId, 'generate_ok', { provider: 'pollinations', latencyMs: Date.now() - startedAt });
      return NextResponse.json({ success: true, imageUrl, provider: 'pollinations', warnings: w, requestId });
    }
    warnings.push('Pollinations 生成失败，切换 Replicate');

    // ---- 第三层：Replicate SDXL（商业兜底） ----
    if (CFG.replicateApiKey) {
      const replicateUrl = await generateViaReplicate(finalPrompt, width, height, pollAttempts, opts.cosKeyPrefix, requestId, namespace, warnings);
      if (replicateUrl) {
        log(namespace, 'info', requestId, 'generate_ok', { provider: 'replicate', latencyMs: Date.now() - startedAt });
        return NextResponse.json({ success: true, imageUrl: replicateUrl, provider: 'replicate', warnings, requestId });
      }
      warnings.push('Replicate 生成失败，切换 HuggingFace');
    } else {
      warnings.push('未配置 REPLICATE_API_KEY，跳过 Replicate');
    }

    // ---- 第四层：HuggingFace（免费兜底，冷启动 503 重试） ----
    if (CFG.hfApiKey) {
      const hfResult = await generateViaHuggingFace(finalPrompt, opts.hfEndpoint, requestId, namespace);
      if (hfResult) {
        const { imageUrl, warnings: w } = await finalizeImage(hfResult.buffer, '', hfResult.contentType, opts.cosKeyPrefix, requestId, namespace, warnings);
        log(namespace, 'info', requestId, 'generate_ok', { provider: 'huggingface', latencyMs: Date.now() - startedAt });
        return NextResponse.json({ success: true, imageUrl, provider: 'huggingface', warnings: w, requestId });
      }
      warnings.push('HuggingFace 生成失败');
    } else {
      warnings.push('未配置 HUGGINGFACE_API_KEY，跳过 HuggingFace');
    }

    // ---- 终极兜底：内联 SVG 占位图 ----
    const placeholder = placeholderSvg(width, height, opts.placeholderText);
    warnings.push('所有生图服务均不可用，已返回占位图');
    log(namespace, 'warn', requestId, 'generate_placeholder', { latencyMs: Date.now() - startedAt });
    return NextResponse.json({ success: true, imageUrl: placeholder, provider: 'placeholder', warnings, requestId });
  };
}
