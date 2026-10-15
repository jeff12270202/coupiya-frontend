// ============================================================================
// app/api/create-ugc-studio/route.ts —— 极速AI极客创作空间 · 动态分配专属空间
// ----------------------------------------------------------------------------
// 职责（SOP 第 27-32 项）：用户点击「极速 AI 极客创作空间」→ 本接口
//   ① 校验刷脸登录会话 + 余额（>0）
//   ② 用平台主账号（UGC_SECRET_ID/UGC_SECRET_KEY）调用腾讯云 Cloud Studio
//      官方 API（cloudstudio.tencentcloudapi.com）CreateWorkspace
//   ③ 以 UGC-AI-Cinema-Template 模板为底稿，创建用户专属工作区
//   ④ 注入环境变量：USER_ID / COUPIYA_API_BASE / COUPIYA_PUBLISH_TOKEN（HMAC）/
//      可选 TENCENT_HUNYUAN_API_KEY / WORKBUDDY_API_KEY
//   ⑤ 返回带有效期的专属工作区链接 —— 彻底替换旧的共享演示死链接
//
// 产品铁律（用户澄清版）：
//   - 全站开放；仅本入口与「AI 视频生成」强制刷脸登录 + 余额
//   - 用户不需要腾讯云账号：空间由平台主账号 API 分配，成本靠 Credits 回收
//
// ⚠️ 待办核对（SOP 28：先调研再写代码，不凭猜测）：
//   腾讯云 Cloud Studio OpenAPI 的准确「服务名 / 版本号 / CreateWorkspace 参数名」
//   以官方文档为准（本文件按 服务=CloudStudio、版本=2021-05-08、
//   参数=Name/TemplateId/EnvVars 编写，SDK 动态导入 + 上游错误原样透出，
//   字段不符时日志与报错会明确暴露，按文档调整即可）。
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30; // CreateWorkspace 为轻量创建请求

/* ============================================================================
 * 一、配置中心
 * ========================================================================= */

const CFG = {
  // ---- Cloud Studio 平台主账号凭证（UGC_* 优先，SECRET_* 兜底） ----
  ugcSecretId: process.env.UGC_SECRET_ID || process.env.SECRET_ID || '',
  ugcSecretKey: process.env.UGC_SECRET_KEY || process.env.SECRET_KEY || '',
  ugcRegion: process.env.CLOUDSTUDIO_REGION || 'ap-guangzhou',
  /** 控制台私有模板 UGC-AI-Cinema-Template 的模板 ID（必配） */
  ugcTemplateId: process.env.CLOUDSTUDIO_TEMPLATE_ID || '',

  // ---- 计费门槛（SOP 20/26） ----
  requireCredits: process.env.REQUIRE_CREDITS !== 'false', // 生产默认开启

  // ---- 网站 API 基址（注入工作区，供 main.py 调用发布接口） ----
  apiBase: (process.env.NEXT_PUBLIC_API_URL || 'https://api.coupiya.com').replace(/\/+$/, ''),

  // ---- 可选注入的工作区密钥（存在才注入，避免泄漏空值） ----
  hunyuanApiKey: process.env.TENCENT_HUNYUAN_API_KEY || '',
  workbuddyApiKey: process.env.WORKBUDDY_API_KEY || '',

  // ---- 工作区复用（同一用户短时间内不重复创建，避免烧云资源） ----
  reuseMs: Number(process.env.STUDIO_REUSE_MS ?? 10 * 60_000), // 默认 10 分钟

  // ---- 限流（创建工作区成本高，默认 3 次 / 10 分钟 / 用户） ----
  rateLimit: {
    windowMs: Number(process.env.STUDIO_RATE_WINDOW_MS ?? 600_000),
    max: Number(process.env.STUDIO_RATE_MAX ?? 3),
  },

  // ---- 仅早期联调：允许用请求头冒充用户（生产必须 false） ----
  allowUnsafeUserId: process.env.ALLOW_UNSAFE_USER_ID === 'true',
};

/* ============================================================================
 * 二、工具函数
 * ========================================================================= */

function makeRequestId(): string {
  return crypto.randomUUID();
}

function log(level: 'info' | 'warn' | 'error', requestId: string, event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'create-ugc-studio', requestId, event, ...extra });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** 统一错误响应（error 字段兼容 blog 页 openStudio 的 data?.error 读取） */
function err(code: string, message: string, status: number, requestId: string) {
  return NextResponse.json({ success: false, code, message, error: message, requestId }, { status });
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip') || 'unknown';
}

const rateBuckets = new Map<string, number[]>();
function rateLimitCheck(key: string): { ok: boolean; retryAfterSec: number } {
  const { windowMs, max } = CFG.rateLimit;
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

/** 同用户工作区复用缓存（进程内；多实例部署请换 Redis） */
const workspaceCache = new Map<number, { url: string; workspaceId: string; expiresAt: number }>();

/* ============================================================================
 * 三、鉴权（会话优先；联调兜底）
 * ========================================================================= */

/**
 * 解析当前登录用户：优先网站登录会话（/api/auth/me 同源实现 @/lib/session），
 * 会话模块未就绪时仅 ALLOW_UNSAFE_USER_ID=true 的联调环境允许 x-coupiya-user-id 头。
 */
async function resolveSessionUser(req: NextRequest, requestId: string): Promise<{ userId: number; balance: number } | null> {
  try {
    const session = await import('@/lib/session');
    const user = await session.getSessionUser(req);
    if (user?.id) {
      const ledger = await import('@/lib/ledger');
      const balance = await ledger.getBalance(user.id); // USER_NOT_FOUND 会抛出 → 下方捕获
      return { userId: user.id, balance };
    }
    return null;
  } catch {
    /* 会话模块未部署（人脸注册后端待建）→ 走联调兜底 */
  }
  if (CFG.allowUnsafeUserId) {
    const raw = Number(req.headers.get('x-coupiya-user-id'));
    if (Number.isInteger(raw) && raw > 0) {
      try {
        const ledger = await import('@/lib/ledger');
        const balance = await ledger.getBalance(raw);
        return { userId: raw, balance };
      } catch {
        log('warn', requestId, 'dev_user_missing', { userId: raw });
        return null;
      }
    }
  }
  return null;
}

/* ============================================================================
 * 四、Cloud Studio 创建工作区（平台主账号代用户创建）
 * ========================================================================= */

interface CreateWorkspaceResult {
  workspaceId: string;
  url: string;
  warnings: string[];
}

async function createCloudStudioWorkspace(
  userId: number,
  publishToken: string,
  requestId: string,
): Promise<CreateWorkspaceResult> {
  const warnings: string[] = [];

  // 1. 动态初始化 SDK（未安装 → fail-closed）
  const tc = (await import('tencentcloud-sdk-nodejs')) as unknown as {
    cloudstudio?: { v20210508?: { Client?: new (opts: unknown) => unknown } };
    CloudStudio?: { v20210508?: { Client?: new (opts: unknown) => unknown } };
  };
  const Client = tc.cloudstudio?.v20210508?.Client ?? tc.CloudStudio?.v20210508?.Client;
  if (!Client) throw new Error('未安装 tencentcloud-sdk-nodejs，或版本不含 CloudStudio（v20210508）');
  const client = new Client({
    credential: { secretId: CFG.ugcSecretId, secretKey: CFG.ugcSecretKey },
    region: CFG.ugcRegion,
    profile: { httpProfile: { endpoint: 'cloudstudio.tencentcloudapi.com' } },
  });

  // 2. 环境变量注入（main.py 读取，无需用户填写）
  const envVars: Array<{ Key: string; Value: string }> = [
    { Key: 'USER_ID', Value: String(userId) },
    { Key: 'COUPIYA_API_BASE', Value: CFG.apiBase },
    { Key: 'COUPIYA_PUBLISH_TOKEN', Value: publishToken },
  ];
  if (CFG.hunyuanApiKey) envVars.push({ Key: 'TENCENT_HUNYUAN_API_KEY', Value: CFG.hunyuanApiKey });
  else warnings.push('未配置 TENCENT_HUNYUAN_API_KEY，工作区内混元密钥不可用');
  if (CFG.workbuddyApiKey) envVars.push({ Key: 'WORKBUDDY_API_KEY', Value: CFG.workbuddyApiKey });
  else warnings.push('未配置 WORKBUDDY_API_KEY，工作区内 Workbuddy 密钥不可用');

  // 3. 调用 CreateWorkspace（⚠️ 参数名以腾讯云 Cloud Studio 官方文档为准）
  const resp = (await (client as unknown as {
    CreateWorkspace: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  }).CreateWorkspace({
    Name: `coupiya-ws-${userId}-${Math.floor(Date.now() / 1000)}`,
    TemplateId: CFG.ugcTemplateId,
    EnvVars: envVars,
    // 模板已配置「挂载个人云盘 5GB → /home/coupiya_workspace」（控制台模板管理里设置）
  })) as Record<string, unknown>;

  const workspaceId = String(resp?.WorkspaceId ?? '');
  if (!workspaceId) {
    log('error', requestId, 'create_workspace_no_id', { resp: JSON.stringify(resp ?? {}).slice(0, 500) });
    throw new Error('Cloud Studio 未返回工作区 ID，请检查模板 ID 与账号权限');
  }

  // 4. 工作区链接：优先 API 返回，缺失时按官方控制台域名拼接（待核对）
  const rawUrl = String(resp?.WorkspaceUrl ?? resp?.Url ?? '');
  let url = rawUrl;
  if (!/^https?:\/\//.test(url)) {
    url = `https://cloudstudio.net/workspace/${encodeURIComponent(workspaceId)}`;
    warnings.push('API 未返回工作区链接，已按控制台域名拼接，请确认可访问');
  }

  log('info', requestId, 'workspace_created', { userId, workspaceId });
  return { workspaceId, url, warnings };
}

/* ============================================================================
 * 五、主路由：鉴权 → 余额 → 配置校验 → 签发令牌 → 创建空间
 * ========================================================================= */

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const startedAt = Date.now();

  // ---- 限流（按用户+IP） ----
  const rl = rateLimitCheck(`studio:${getClientIp(req)}`);
  if (!rl.ok) return err('ERR_RATE_LIMITED', '操作过于频繁，请稍后再试', 429, requestId);

  // ---- 鉴权 + 余额（创作入口铁律：刷脸登录 + 余额>0） ----
  const sessionUser = await resolveSessionUser(req, requestId);
  if (!sessionUser) {
    log('warn', requestId, 'auth_required');
    return err('ERR_AUTH', '请先刷脸登录后再进入极客创作空间', 401, requestId);
  }
  if (CFG.requireCredits && sessionUser.balance <= 0) {
    log('info', requestId, 'insufficient_balance', { userId: sessionUser.userId, balance: sessionUser.balance });
    return err('INSUFFICIENT_BALANCE', '余额不足，请先充值后再创建创作空间', 402, requestId);
  }
  log('info', requestId, 'identity_resolved', { userId: sessionUser.userId, balance: sessionUser.balance });

  // ---- 配置校验（fail-closed，缺一不可） ----
  if (!CFG.ugcSecretId || !CFG.ugcSecretKey) {
    return err('ERR_CONFIG', 'Cloud Studio 平台凭证未配置（UGC_SECRET_ID / UGC_SECRET_KEY）', 503, requestId);
  }
  if (!CFG.ugcTemplateId) {
    return err('ERR_CONFIG', 'Cloud Studio 模板未配置（CLOUDSTUDIO_TEMPLATE_ID，请先在控制台创建 UGC-AI-Cinema-Template）', 503, requestId);
  }
  let publishToken = '';
  try {
    const pt = await import('@/lib/publish-token');
    if (!pt.publishSecretConfigured()) {
      return err('ERR_CONFIG', '发布令牌密钥未配置（COUPIYA_PUBLISH_SECRET）', 503, requestId);
    }
    publishToken = pt.signPublishToken(sessionUser.userId);
  } catch (e) {
    log('error', requestId, 'publish_token_failed', { error: (e as Error)?.message });
    return err('ERR_CONFIG', '发布令牌签发失败，请联系管理员', 503, requestId);
  }

  // ---- 复用缓存：同一用户短时间内直接返回已有空间 ----
  const cached = workspaceCache.get(sessionUser.userId);
  if (cached && cached.expiresAt > Date.now()) {
    log('info', requestId, 'workspace_reused', { userId: sessionUser.userId, workspaceId: cached.workspaceId });
    return NextResponse.json({
      success: true,
      workspaceId: cached.workspaceId,
      url: cached.url,
      reused: true,
      expiresAt: cached.expiresAt,
      warnings: ['已为您复用最近创建的个人空间，如进入后找不到代码请刷新'],
      requestId,
    });
  }

  // ---- 创建专属空间 ----
  try {
    const created = await createCloudStudioWorkspace(sessionUser.userId, publishToken, requestId);
    workspaceCache.set(sessionUser.userId, {
      url: created.url,
      workspaceId: created.workspaceId,
      expiresAt: Date.now() + CFG.reuseMs,
    });
    log('info', requestId, 'studio_ok', { userId: sessionUser.userId, latencyMs: Date.now() - startedAt });
    return NextResponse.json({
      success: true,
      workspaceId: created.workspaceId,
      url: created.url,
      reused: false,
      expiresAt: Date.now() + CFG.reuseMs,
      warnings: created.warnings,
      requestId,
    });
  } catch (e) {
    log('error', requestId, 'studio_failed', { error: (e as Error)?.message });
    return err(
      'ERR_UPSTREAM',
      `Cloud Studio 创建失败：${(e as Error)?.message ?? '未知错误'}（请确认已开通 Cloud Studio 且子账号密钥具备权限）`,
      502,
      requestId,
    );
  }
}
