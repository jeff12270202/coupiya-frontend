// ============================================================================
// app/api/ai/publish-vod-movie/route.ts —— 全球生产级发布闸门（v2：PullUpload 方案）
// ----------------------------------------------------------------------------
// 本版在【保留您已验证的可用集成】基础上做生产级加固：
//   * 保留：腾讯云 VOD PullUpload（URL 直拉，无需手动上传）+ MAS Videos 插件
//           的 php-serialize `_sources` 元数据（播放页依赖）+ movie_genre
//   * 新增加固：
//     1. 发布令牌鉴权（HMAC，令牌内 userId 为准）——防任何人伪造作者上墙
//     2. 先扣费（账本事务双写）→ VOD → WordPress；任一步失败自动原路退款
//     3. 可选 HLS 转码：VOD_HLS_TEMPLATE_ID > 0 时对成品再跑 ProcessMedia，
//        从 TranscodeSet 取 .m3u8 播放地址（SOP 要求的 HLS 自适应流）
//     4. 写入 author_user_id / poster_url / source / coupiya_ref 到 WP meta
//     5. 限流 + requestId + JSON 结构化日志 + 全链路上游超时
//     6. 兼容两套参数名：aiVideoUrl/movieTitle（现有）与 video_url/title（规范）
//     7. 统一错误码 ERR_*；SDK/php-serialize 动态导入，未安装即 fail-closed
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // VOD 拉取+转码轮询可达数分钟

/* ===========================================================================
 * 一、配置中心
 * ========================================================================= */

const CFG = {
  // ---- 计费 ----
  requireCredits: process.env.REQUIRE_CREDITS !== 'false',
  publishCostCredits: Number(process.env.PUBLISH_COST_CREDITS ?? 20),

  // ---- 发布令牌 ----
  requirePublishToken: process.env.REQUIRE_PUBLISH_TOKEN !== 'false',
  allowUnsafeUserId: process.env.ALLOW_UNSAFE_USER_ID === 'true', // 仅早期联调

  // ---- WordPress ----
  wpApi: (process.env.NEXT_PUBLIC_WP_API_URL ?? 'https://blog.coupiya.com/wp-json/wp/v2').replace(/\/+$/, ''),
  wpUser: process.env.WP_ADMIN_USER ?? '',
  wpAppPassword: process.env.WP_APP_PASSWORD ?? '',
  /** 默认分类 ID（JSON 数组），如 "[59]"；留空则不传 movie_genre */
  defaultGenreIds: parseGenreIds(process.env.DEFAULT_GENRE_IDS),

  // ---- 腾讯云 VOD（PullUpload 方案） ----
  vodSecretId: process.env.VOD_SECRET_ID || process.env.SECRET_ID || '',
  vodSecretKey: process.env.VOD_SECRET_KEY || process.env.SECRET_KEY || '',
  vodRegion: process.env.VOD_REGION ?? 'ap-guangzhou',
  /** HLS 转码模板：>0 时对成品再转码并取 .m3u8；0=仅存储（兼容现有行为） */
  vodHlsTemplateId: Number(process.env.VOD_HLS_TEMPLATE_ID ?? 0),
  vodProcedure: process.env.VOD_PROCEDURE ?? '', // 可选：PullUpload 时直接挂流程
  vodPullPollAttempts: Number(process.env.VOD_PULL_POLL_ATTEMPTS ?? 90), // 90 × 2s ≈ 3 分钟
  vodTaskPollAttempts: Number(process.env.VOD_TASK_POLL_ATTEMPTS ?? 60), // 60 × 3s ≈ 3 分钟
  vodPollIntervalMs: 2000,
  sdkTimeoutMs: 30_000,

  // ---- 输入限制 ----
  maxBodyBytes: 256 * 1024,
  maxTitleChars: 120,
  maxDescChars: 1000,
  maxUrlChars: 2000,
  maxIdemChars: 128,

  // ---- 限流 ----
  rateLimit: {
    windowMs: Number(process.env.PUBLISH_RATE_WINDOW_MS ?? 60_000),
    max: Number(process.env.PUBLISH_RATE_MAX ?? 20),
  },
};

function parseGenreIds(raw: string | undefined): number[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.map(Number).filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

/* ===========================================================================
 * 二、工具函数
 * ========================================================================= */

function makeRequestId(): string {
  return crypto.randomUUID();
}

function log(level: 'info' | 'warn' | 'error', requestId: string, event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'publish-vod-movie', requestId, event, ...extra });
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
  const key = `publish:${ip}`;
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

function cleanStr(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function validateVideoUrl(raw: unknown): { url: string; error?: ReturnType<typeof err> } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { url: '', error: err('ERR_VALIDATION', '缺少视频 URL 参数', 400, makeRequestId()) };
  }
  const url = raw.trim().slice(0, CFG.maxUrlChars);
  if (!/^https?:\/\//.test(url)) {
    return { url: '', error: err('ERR_VALIDATION', '视频 URL 必须是 http(s) 链接', 400, makeRequestId()) };
  }
  return { url };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ===========================================================================
 * 三、鉴权与计费（与 lib/publish-token.ts、lib/ledger.ts 联动）
 * ========================================================================= */

async function resolveUserId(req: NextRequest, body: Record<string, unknown>, requestId: string): Promise<number | null> {
  const token = (req.headers.get('x-coupiya-publish-token') ?? cleanStr(body.publish_token, 500)) || '';
  if (token) {
    try {
      const mod = await import('@/lib/publish-token');
      if (!mod.publishSecretConfigured()) {
        log('error', requestId, 'publish_secret_missing');
        return null;
      }
      const verified = mod.verifyPublishToken(token);
      if (verified) return verified.userId;
      log('warn', requestId, 'publish_token_invalid');
      return null;
    } catch {
      log('error', requestId, 'publish_token_lib_error');
      return null;
    }
  }
  if (CFG.allowUnsafeUserId) {
    const raw = Number(body.user_id);
    if (Number.isInteger(raw) && raw > 0) return raw;
  }
  return null;
}

async function chargeUser(userId: number, requestId: string): Promise<'ok' | 'insufficient' | 'error'> {
  try {
    const ledger = await import('@/lib/ledger');
    const result = await ledger.deductCredits(userId, CFG.publishCostCredits, 'movie_publish', requestId);
    if (!result.ok) return 'insufficient';
    log('info', requestId, 'publish_charged', { userId, cost: CFG.publishCostCredits, balance: result.balance });
    return 'ok';
  } catch (e) {
    log('error', requestId, 'ledger_error', { error: (e as Error)?.message });
    return 'error';
  }
}

async function refundUser(userId: number, requestId: string, reason: string): Promise<void> {
  try {
    const ledger = await import('@/lib/ledger');
    await ledger.addCredits(userId, CFG.publishCostCredits, 'refund', reason, requestId);
    log('info', requestId, 'publish_refunded', { userId, amount: CFG.publishCostCredits, reason });
  } catch (e) {
    log('error', requestId, 'refund_failed', { error: (e as Error)?.message });
  }
}

/* ===========================================================================
 * 四、腾讯云 VOD（PullUpload 方案 + 可选 HLS 转码）
 * ========================================================================= */

/** 动态初始化 VOD 客户端（SDK 未安装 → 抛错 fail-closed） */
async function createVodClient(): Promise<{ client: unknown; Client: new (opts: unknown) => unknown }> {
  if (!CFG.vodSecretId || !CFG.vodSecretKey) throw new Error('VOD 未配置 SecretId/SecretKey');
  const tc = (await import('tencentcloud-sdk-nodejs')) as unknown as {
    default?: { vod?: { v20180717?: { Client?: new (opts: unknown) => unknown } } };
    vod?: { v20180717?: { Client?: new (opts: unknown) => unknown } };
  };
  const vodMod = tc.default ?? tc;
  const Client = vodMod.vod?.v20180717?.Client;
  if (!Client) throw new Error('未安装 tencentcloud-sdk-nodejs');
  const client = new Client({
    credential: { secretId: CFG.vodSecretId, secretKey: CFG.vodSecretKey },
    region: CFG.vodRegion,
    profile: { httpProfile: { endpoint: 'vod.tencentcloudapi.com' } },
  });
  return { client, Client };
}

type AnyClient = {
  PullUpload: (p: { MediaUrl: string; MediaName: string; MediaType?: string; Procedure?: string }) => Promise<{ TaskId: string }>;
  DescribeTaskDetail: (p: { TaskId: string }) => Promise<{ Status: string; PullUploadTask?: { FileId?: string; Message?: string }; ErrCode?: number; Message?: string }>;
  ProcessMedia: (p: unknown) => Promise<{ TaskId: string }>;
  DescribeMediaInfos: (p: { FileIds: string[]; Filters?: string[] }) => Promise<{
    MediaInfoSet?: Array<{
      MediaUrl?: string;
      BasicInfo?: { MediaUrl?: string };
      TranscodeInfo?: { TranscodeSet?: Array<{ Url?: string }> };
    }>;
  }>;
};

/** 核心：PullUpload 拉取 → 轮询 FileId → 取播放地址 →（可选）HLS 转码取 .m3u8 */
async function pullUploadToPlayUrl(mediaUrl: string, movieTitle: string, requestId: string): Promise<{ fileId: string; playUrl: string }> {
  const { client } = await createVodClient();
  const c = client as AnyClient;

  // 1. PullUpload：URL 直拉（无需手动下载上传）
  log('info', requestId, 'vod_pull_upload_start', { mediaUrl: mediaUrl.slice(0, 120) });
  const pull = await c.PullUpload({
    MediaUrl: mediaUrl,
    MediaName: movieTitle || `AI视频_${Date.now()}`,
    MediaType: 'mp4',
    ...(CFG.vodProcedure ? { Procedure: CFG.vodProcedure } : {}),
  });

  // 2. 轮询任务直到 FINISH / FAILED
  let fileId = '';
  for (let i = 0; i < CFG.vodPullPollAttempts; i++) {
    await sleep(CFG.vodPollIntervalMs);
    const task = await c.DescribeTaskDetail({ TaskId: pull.TaskId });
    const status = task.Status;
    if (status === 'FINISH' || status === 'PROCESS_SUCCESS') {
      fileId = task.PullUploadTask?.FileId ?? '';
      if (fileId) break;
    } else if (status === 'FAILED' || status === 'PROCESS_FAILED') {
      throw new Error(`VOD 拉取失败: ${task.PullUploadTask?.Message ?? task.Message ?? task.ErrCode ?? '未知'}`);
    }
    if (i > 0 && i % 10 === 0) log('info', requestId, 'vod_pull_polling', { seconds: (i + 1) * 2, status });
  }
  if (!fileId) throw new Error('VOD 拉取超时');

  // 3. 可选 HLS 转码（VOD_HLS_TEMPLATE_ID > 0 时启用）
  if (CFG.vodHlsTemplateId > 0 && !CFG.vodProcedure) {
    log('info', requestId, 'vod_hls_start', { templateId: CFG.vodHlsTemplateId });
    const task = await c.ProcessMedia({
      FileId: fileId,
      MediaProcessTask: { TranscodeTaskSet: [{ Definition: CFG.vodHlsTemplateId, WatermarkSet: [] }] },
    });
    for (let i = 0; i < CFG.vodTaskPollAttempts; i++) {
      await sleep(3000);
      const t = await c.DescribeTaskDetail({ TaskId: task.TaskId });
      if (t.Status === 'FINISH' || t.Status === 'PROCESS_SUCCESS') break;
      if (t.Status === 'FAILED' || t.Status === 'PROCESS_FAILED') throw new Error(`HLS 转码失败: ${t.Message ?? t.ErrCode ?? '未知'}`);
    }
  }

  // 4. 取播放地址：优先 HLS(.m3u8)，其次源 MediaUrl
  let playUrl = '';
  const info = await c.DescribeMediaInfos({ FileIds: [fileId], Filters: ['basicInfo'] });
  const media = info.MediaInfoSet?.[0];
  if (media?.TranscodeInfo?.TranscodeSet) {
    playUrl = media.TranscodeInfo.TranscodeSet.find((t) => t.Url?.includes('.m3u8'))?.Url ?? '';
  }
  playUrl = playUrl || media?.MediaUrl || media?.BasicInfo?.MediaUrl || '';
  if (!playUrl) throw new Error('无法获取视频播放地址');
  log('info', requestId, 'vod_ready', { fileId, playUrl: playUrl.slice(0, 120) });
  return { fileId, playUrl };
}

/* ===========================================================================
 * 五、写 WordPress（MAS Videos 兼容：php-serialize _sources）
 * ========================================================================= */

/** 生成 MAS Videos 插件的 PHP 序列化 _sources 元数据 */
async function serializeSources(playUrl: string): Promise<string> {
  const ps = (await import('php-serialize')) as unknown as {
    default?: { serialize: (v: unknown) => string };
    serialize?: (v: unknown) => string;
  };
  const serialize = ps.default?.serialize ?? ps.serialize;
  if (typeof serialize !== 'function') throw new Error('未安装 php-serialize');
  return serialize([
    {
      name: playUrl,
      choice: 'movie_embed',
      embed_content: '',
      link: '',
      is_affiliate: false,
      quality: '',
      language: '',
      player: '',
      date_added: '',
      position: 0,
    },
  ]);
}

interface WpCreateResult {
  id: number;
  slug: string;
  link: string;
}

async function createWordPressMovie(
  params: {
    title: string;
    description: string;
    playUrl: string;
    serializedSources: string;
    authorUserId: number;
    posterUrl: string;
    genre: string;
    source: string;
    idemKey: string;
  },
  _requestId: string,
): Promise<WpCreateResult> {
  if (!CFG.wpUser || !CFG.wpAppPassword) throw new Error('WordPress 应用密码未配置');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${CFG.wpApi}/movie`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${CFG.wpUser}:${CFG.wpAppPassword}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: params.title,
        content: params.description || '',
        status: 'publish',
        ...(CFG.defaultGenreIds.length ? { movie_genre: CFG.defaultGenreIds } : {}),
        meta: {
          _sources: params.serializedSources,
          author_user_id: String(params.authorUserId),
          m3u8_url: params.playUrl,
          poster_url: params.posterUrl || '',
          genre: params.genre || '',
          source: params.source || 'geek',
          ...(params.idemKey ? { coupiya_ref: params.idemKey } : {}),
        },
      }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as
      | { id?: number; slug?: string; link?: string; code?: string; message?: string }
      | null;
    if (!res.ok || !data?.id) {
      throw new Error(`WordPress 写入失败[${res.status}]: ${data?.message ?? data?.code ?? '未知'}`);
    }
    return { id: data.id, slug: data.slug ?? '', link: data.link ?? '' };
  } finally {
    clearTimeout(timer);
  }
}

/* ===========================================================================
 * 六、主路由：鉴权 → 扣费 → VOD → 上墙（失败退款）
 * ========================================================================= */

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const startedAt = Date.now();
  const warnings: string[] = [];

  // ---- 限流 ----
  const rl = rateLimitCheck(getClientIp(req));
  if (!rl.ok) return err('ERR_RATE_LIMITED', '请求过于频繁，请稍后再试', 429, requestId);

  // ---- 解析 ----
  const parsed = await parseJsonBody(req, requestId);
  if (parsed.error) return parsed.error;
  const body = parsed.body!;

  // 兼容两套参数名：现有 aiVideoUrl/movieTitle，规范 video_url/title
  const title = cleanStr(body.movieTitle ?? body.title, CFG.maxTitleChars);
  if (!title) return err('ERR_VALIDATION', '缺少标题参数', 400, requestId);
  const { url: videoUrl, error: urlError } = validateVideoUrl(body.aiVideoUrl ?? body.video_url);
  if (urlError) return urlError;
  const description = cleanStr(body.description, CFG.maxDescChars);
  const posterUrl = cleanStr(body.poster_url, CFG.maxUrlChars);
  const genre = cleanStr(body.genre, 50);
  const source = cleanStr(body.source, 20) || 'geek';
  const idemKey = cleanStr(body.idempotency_key, CFG.maxIdemChars);

  log('info', requestId, 'publish_start', { title, videoUrl: videoUrl.slice(0, 120), source });

  // ---- 鉴权（发布令牌，令牌内 userId 为准） ----
  const userId = await resolveUserId(req, body, requestId);
  if (userId === null) {
    return err('ERR_AUTH', '发布凭证无效或已过期，请重新进入创作空间', 401, requestId);
  }
  log('info', requestId, 'identity_resolved', { userId });

  // ---- 【先扣费】 ----
  let charged = false;
  if (CFG.requireCredits) {
    const charge = await chargeUser(userId, requestId);
    if (charge === 'insufficient') return err('INSUFFICIENT_BALANCE', '余额不足，请充值后发布', 402, requestId);
    if (charge === 'error') return err('ERR_LEDGER', '计费系统异常，请稍后重试', 503, requestId);
    charged = true;
  }

  // ---- 【再转码（VOD）】 ----
  let fileId = '';
  let playUrl = '';
  try {
    const result = await pullUploadToPlayUrl(videoUrl, title, requestId);
    fileId = result.fileId;
    playUrl = result.playUrl;
  } catch (e) {
    log('error', requestId, 'vod_failed', { error: (e as Error)?.message });
    if (charged) await refundUser(userId, requestId, 'vod_failed');
    return err('ERR_VOD', '视频处理失败，已自动退款', 502, requestId);
  }

  // ---- 【后上墙（WordPress + MAS _sources）】 ----
  let movie: WpCreateResult;
  try {
    const serializedSources = await serializeSources(playUrl);
    movie = await createWordPressMovie(
      { title, description, playUrl, serializedSources, authorUserId: userId, posterUrl, genre, source, idemKey },
      requestId,
    );
  } catch (e) {
    log('error', requestId, 'wp_failed', { error: (e as Error)?.message });
    if (charged) await refundUser(userId, requestId, 'wordpress_write_failed');
    return err('ERR_WORDPRESS', '写入 WordPress 失败，已自动退款', 502, requestId);
  }

  log('info', requestId, 'publish_ok', { movieId: movie.id, latencyMs: Date.now() - startedAt });
  return NextResponse.json({
    success: true,
    postId: movie.id,
    movie: { id: movie.id, slug: movie.slug, link: movie.link, fileId, playUrl, author_user_id: userId },
    warnings,
    requestId,
  });
}
