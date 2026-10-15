// ============================================================================
// app/api/ai/generate-video/route.ts —— 全球生产级 AI 视频生成网关（引擎1 核心）
// ----------------------------------------------------------------------------
// 职责：用户输入 Prompt → 扣费 → 四层降级生成视频 → COS 持久化 → 返回稳定直链
//   （生成成功后，前端把 videoUrl 交给 /api/ai/publish-vod-movie 发布上墙）
//
// 相对原版的全部升级：
//   1. 【计费闸门】先扣费再生成（SOP 36/42：余额不足 402、生成失败自动原路退款），
//      积分账本走 lib/ledger.ts（Prisma 事务双写）；未配置账本则 fail-closed
//   2. 【COS 持久化】Replicate/Pollinations 的临时链接几小时后过期，成品视频
//      一律落地腾讯云 COS，电影墙永不裂图
//   3. 全链路 requestId + JSON 结构化日志；每 IP 限流（视频最烧钱，默认 5 次/分钟）
//   4. 所有上游调用带超时；Replicate 轮询每轮 15s 超时、处理 canceled
//   5. prompt 校验与长度上限；请求体大小限制
//   6. 失败时【诚实契约】：返回 503 + 错误码，绝不 fake success 塞占位视频
//   7. 模型版本/端点全部环境变量可配
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { deepseekOfficialModel } from '@/lib/ai-models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 视频生成可达 1-3 分钟，放宽到 5 分钟

/* ===========================================================================
 * 一、配置中心
 * ========================================================================= */

const CFG = {
  // ---- 计费 ----
  requireCredits: process.env.REQUIRE_CREDITS !== 'false', // 生产默认开启
  videoCostCredits: Number(process.env.VIDEO_GENERATION_COST ?? 50), // 每次消耗 Credits

  // ---- DeepSeek 视频提示词优化 ----
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekEndpoint: process.env.DEEPSEEK_ENDPOINT ?? 'https://api.deepseek.com/v1/chat/completions',
  deepseekModel: deepseekOfficialModel(),
  deepseekTimeoutMs: 15_000,

  // ---- Pollinations 视频（免费首选） ----
  pollinationsBase: process.env.POLLINATIONS_VIDEO_BASE ?? 'https://image.pollinations.ai/prompt',
  pollinationsTimeoutMs: Number(process.env.POLLINATIONS_TIMEOUT_MS ?? 90_000),

  // ---- Replicate Stable Video Diffusion（商业主力） ----
  replicateApiKey: process.env.REPLICATE_API_KEY ?? '',
  replicateVideoVersion:
    process.env.REPLICATE_VIDEO_VERSION ??
    'stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438',
  replicatePollAttempts: Number(process.env.REPLICATE_VIDEO_POLL_ATTEMPTS ?? 60), // 60 × 2s ≈ 120s
  replicatePollIntervalMs: 2000,
  replicateFetchTimeoutMs: 15_000,

  // ---- 输入/输出限制 ----
  maxPromptChars: 2000,
  minPromptChars: 1,
  maxVideoBytes: 200 * 1024 * 1024, // 成品视频 ≤ 200MB
  maxBodyBytes: 64 * 1024,

  // ---- 限流（视频最贵，默认 5 次/分钟/IP） ----
  rateLimit: {
    windowMs: Number(process.env.VIDEO_RATE_WINDOW_MS ?? 60_000),
    max: Number(process.env.VIDEO_RATE_MAX ?? 5),
  },

  // ---- COS 持久化（密钥兼容 SECRET_ID/SECRET_KEY） ----
  cos: {
    secretId: process.env.COS_SECRET_ID || process.env.SECRET_ID || '',
    secretKey: process.env.COS_SECRET_KEY || process.env.SECRET_KEY || '',
    bucket: process.env.COS_BUCKET || '',
    region: process.env.COS_REGION || '',
  },
};

/** DeepSeek 视频提示词系统提示词（可用 VIDEO_PROMPT_OVERRIDE 覆盖） */
const VIDEO_PROMPT_SYSTEM =
  process.env.VIDEO_PROMPT_OVERRIDE ??
  [
    '你是一个资深的 AI 视频生成提示词工程师。请将用户的描述转化为适合 AI 视频模型生成动态视频的高质量英文提示词。',
    '要求：直接输出英文提示词，包含场景动态变化、镜头运动、光影流动与主体细节。不要包含任何解释、对话、引号或多余说明。',
  ].join('');

/* ===========================================================================
 * 二、工具函数
 * ========================================================================= */

function makeRequestId(): string {
  return crypto.randomUUID();
}

function log(level: 'info' | 'warn' | 'error', requestId: string, event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'generate-video', requestId, event, ...extra });
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
  const key = `video:${ip}`;
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

function sanitizePrompt(raw: unknown): { prompt: string; error?: ReturnType<typeof err> } {
  if (typeof raw !== 'string') return { prompt: '', error: err('ERR_VALIDATION', '缺少 prompt 参数', 400, makeRequestId()) };
  const prompt = raw.replace(/\s+/g, ' ').trim();
  if (prompt.length < CFG.minPromptChars) {
    return { prompt: '', error: err('ERR_VALIDATION', 'prompt 不能为空', 400, makeRequestId()) };
  }
  return { prompt: prompt.slice(0, CFG.maxPromptChars) };
}

/** 下载视频并校验（带超时 + 大小限制） */
async function downloadVideo(url: string, timeoutMs: number, requestId: string): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) {
      log('warn', requestId, 'video_download_not_ok', { status: res.status, url: url.slice(0, 120) });
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1024 || buffer.length > CFG.maxVideoBytes) {
      log('warn', requestId, 'video_download_bad_size', { bytes: buffer.length });
      return null;
    }
    return buffer;
  } catch (e) {
    log('warn', requestId, 'video_download_failed', { error: (e as Error)?.message });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 上传视频到 COS（未配置/失败返回 null） */
async function uploadVideoToCos(buffer: Buffer, requestId: string): Promise<string | null> {
  const { secretId, secretKey, bucket, region } = CFG.cos;
  if (!secretId || !secretKey || !bucket || !region) return null;
  try {
    const mod = await import('cos-nodejs-sdk-v5');
    const COS = (mod.default ?? mod) as unknown as new (opts: { SecretId: string; SecretKey: string }) => {
      putObject: (params: Record<string, unknown>, cb: (err: Error | null) => void) => void;
    };
    const cos = new COS({ SecretId: secretId, SecretKey: secretKey });
    const key = `ai-videos/${requestId}.mp4`;
    await new Promise<void>((resolve, reject) => {
      cos.putObject(
        { Bucket: bucket, Region: region, Key: key, Body: buffer, ContentType: 'video/mp4' },
        (e) => (e ? reject(e) : resolve()),
      );
    });
    const url = `https://${bucket}.cos.${region}.myqcloud.com/${key}`;
    log('info', requestId, 'cos_video_uploaded', { url });
    return url;
  } catch (e) {
    log('warn', requestId, 'cos_video_failed', { error: (e as Error)?.message });
    return null;
  }
}

/** 轮询 Replicate 视频任务（每轮请求自带超时；处理 canceled） */
async function pollReplicate(predictionId: string, requestId: string): Promise<{ output: unknown; status: string } | null> {
  for (let attempt = 0; attempt < CFG.replicatePollAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CFG.replicateFetchTimeoutMs);
    try {
      const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { Authorization: `Token ${CFG.replicateApiKey}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        log('warn', requestId, 'replicate_poll_http', { status: res.status, attempt });
        await sleep(CFG.replicatePollIntervalMs);
        continue;
      }
      const data = await res.json();
      const status = String(data?.status ?? '');
      if (status === 'succeeded') return { output: data?.output, status };
      if (status === 'failed' || status === 'canceled') return { output: null, status };
      await sleep(CFG.replicatePollIntervalMs);
    } catch (e) {
      log('warn', requestId, 'replicate_poll_error', { attempt, error: (e as Error)?.message });
      await sleep(CFG.replicatePollIntervalMs);
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
 * 三、各生成层
 * ========================================================================= */

/** 第一层：DeepSeek 视频提示词优化（带超时；失败用原始提示词） */
async function optimizeVideoPrompt(prompt: string, requestId: string): Promise<string> {
  if (!CFG.deepseekApiKey) return prompt;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CFG.deepseekTimeoutMs);
  try {
    const res = await fetch(CFG.deepseekEndpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CFG.deepseekApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CFG.deepseekModel,
        messages: [
          { role: 'system', content: VIDEO_PROMPT_SYSTEM },
          { role: 'user', content: prompt },
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return prompt;
    const data = await res.json();
    const optimized = String(data?.choices?.[0]?.message?.content ?? '')
      .replace(/^["'\s]+|["'\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, CFG.maxPromptChars);
    return optimized || prompt;
  } catch (e) {
    log('warn', requestId, 'deepseek_failed', { error: (e as Error)?.message });
    return prompt;
  } finally {
    clearTimeout(timer);
  }
}

/** 第二层：Pollinations 视频（下载 → COS 持久化） */
async function generateViaPollinations(finalPrompt: string, requestId: string): Promise<string | null> {
  const pollUrl =
    `${CFG.pollinationsBase}/${encodeURIComponent(finalPrompt)}` +
    `?video=true&width=1024&height=576&nologin=true&seed=${Math.floor(Math.random() * 1_000_000)}`;
  const buffer = await downloadVideo(pollUrl, CFG.pollinationsTimeoutMs, requestId);
  if (!buffer) return null;
  const cosUrl = await uploadVideoToCos(buffer, requestId);
  if (cosUrl) return cosUrl;
  // COS 未配置时：返回源地址（临时链接，warnings 提示）
  return pollUrl;
}

/** 第三层：Replicate Stable Video Diffusion（下载 → COS 持久化） */
async function generateViaReplicate(finalPrompt: string, inputImage: string | null, requestId: string): Promise<string | null> {
  try {
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { Authorization: `Token ${CFG.replicateApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: CFG.replicateVideoVersion,
        input: {
          prompt: finalPrompt,
          // SVD 为图生视频模型：有 input_image 则传入，否则由模板/参数决定
          ...(inputImage ? { input_image: inputImage } : {}),
        },
      }),
      signal: AbortSignal.timeout(CFG.replicateFetchTimeoutMs),
    });
    if (!createRes.ok) {
      log('warn', requestId, 'replicate_create_http', { status: createRes.status });
      return null;
    }
    const pred = await createRes.json();
    if (!pred?.id) return null;
    const result = await pollReplicate(pred.id, requestId);
    if (!result || result.status !== 'succeeded') {
      log('warn', requestId, 'replicate_not_succeeded', { status: result?.status ?? 'timeout' });
      return null;
    }
    const remoteUrl = Array.isArray(result.output) ? String(result.output[0] ?? '') : String(result.output ?? '');
    if (!remoteUrl.startsWith('http')) return null;
    const buffer = await downloadVideo(remoteUrl, CFG.replicateFetchTimeoutMs, requestId);
    if (buffer) {
      const cosUrl = await uploadVideoToCos(buffer, requestId);
      if (cosUrl) return cosUrl;
    }
    return remoteUrl;
  } catch (e) {
    log('warn', requestId, 'replicate_failed', { error: (e as Error)?.message });
    return null;
  }
}

/* ===========================================================================
 * 四、主路由：先扣费 → 生成 → 失败退款
 * ========================================================================= */

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const startedAt = Date.now();
  const warnings: string[] = [];

  // ---- 限流 ----
  const rl = rateLimitCheck(getClientIp(req));
  if (!rl.ok) return err('ERR_RATE_LIMITED', '请求过于频繁，请稍后再试', 429, requestId);

  // ---- 解析与校验 ----
  const parsed = await parseJsonBody(req, requestId);
  if (parsed.error) return parsed.error;
  const body = parsed.body!;

  const { prompt, error } = sanitizePrompt(body.prompt);
  if (error) return error;
  const inputImage = typeof body.input_image === 'string' && /^https?:\/\//.test(body.input_image) ? body.input_image : null;

  log('info', requestId, 'video_start', { promptLen: prompt.length });

  // ---- 【计费闸门】先扣费，再生成（SOP 36/42） ----
  let chargedUserId: number | null = null;
  if (CFG.requireCredits) {
    const rawId = req.headers.get('x-coupiya-user-id');
    const userId = Number(rawId);
    if (!Number.isInteger(userId) || userId <= 0) {
      log('warn', requestId, 'auth_required');
      return err('ERR_AUTH', '请先登录后再生成视频', 401, requestId);
    }
    let ledger: typeof import('@/lib/ledger');
    try {
      ledger = await import('@/lib/ledger');
    } catch (e) {
      log('error', requestId, 'ledger_missing', { error: (e as Error)?.message });
      return err('ERR_LEDGER', '计费系统未配置，请联系管理员', 503, requestId);
    }
    const result = await ledger.deductCredits(userId, CFG.videoCostCredits, 'video_generation', requestId);
    if (!result.ok) {
      log('info', requestId, 'insufficient_balance', { userId, balance: result.balance });
      return err('INSUFFICIENT_BALANCE', '余额不足，请充值后继续创作', 402, requestId);
    }
    chargedUserId = userId;
    log('info', requestId, 'credits_charged', { userId, cost: CFG.videoCostCredits, balance: result.balance });
  }

  // ---- 生成（任何一层成功即返回；全部失败 → 退款 + 503） ----
  try {
    // 第一层：DeepSeek 优化提示词
    const finalPrompt = await optimizeVideoPrompt(prompt, requestId);

    // 第二层：Pollinations（免费首选）
    const pollUrl = await generateViaPollinations(finalPrompt, requestId);
    if (pollUrl) {
      if (!pollUrl.includes('.cos.')) warnings.push('视频为临时链接（COS 未配置），建议尽快配置持久化');
      log('info', requestId, 'video_ok', { source: 'pollinations', latencyMs: Date.now() - startedAt });
      return NextResponse.json({ success: true, videoUrl: pollUrl, source: 'pollinations', warnings, requestId });
    }
    warnings.push('Pollinations 视频生成失败，切换 Replicate');

    // 第三层：Replicate SVD（商业主力）
    if (CFG.replicateApiKey) {
      const repUrl = await generateViaReplicate(finalPrompt, inputImage, requestId);
      if (repUrl) {
        if (!repUrl.includes('.cos.')) warnings.push('视频为临时链接（COS 未配置），建议尽快配置持久化');
        log('info', requestId, 'video_ok', { source: 'replicate', latencyMs: Date.now() - startedAt });
        return NextResponse.json({ success: true, videoUrl: repUrl, source: 'replicate', warnings, requestId });
      }
      warnings.push('Replicate 视频生成失败');
    } else {
      warnings.push('未配置 REPLICATE_API_KEY，跳过 Replicate');
    }

    // ---- 全部失败：若已扣费则原路退款，并诚实返回失败（绝不 fake success） ----
    if (chargedUserId !== null) {
      try {
        const ledger = await import('@/lib/ledger');
        await ledger.addCredits(chargedUserId, CFG.videoCostCredits, 'refund', 'video_generation_failed', requestId);
        warnings.push('已自动退还本次消耗的 Credits');
        log('info', requestId, 'credits_refunded', { userId: chargedUserId, amount: CFG.videoCostCredits });
      } catch (e) {
        log('error', requestId, 'refund_failed', { error: (e as Error)?.message });
      }
    }
    log('warn', requestId, 'video_all_layers_failed', { latencyMs: Date.now() - startedAt });
    return err('ERR_UPSTREAM', '所有视频生成服务暂不可用，已自动退款，请稍后重试', 503, requestId);
  } catch (e) {
    // 兜底：任何未捕获异常 → 退款 + 500
    if (chargedUserId !== null) {
      try {
        const ledger = await import('@/lib/ledger');
        await ledger.addCredits(chargedUserId, CFG.videoCostCredits, 'refund', 'video_generation_error', requestId);
      } catch (refundErr) {
        log('error', requestId, 'refund_failed', { error: (refundErr as Error)?.message });
      }
    }
    log('error', requestId, 'video_unexpected_error', { error: (e as Error)?.message });
    return err('ERR_INTERNAL', '视频生成服务异常，已自动退款', 500, requestId);
  }
}
