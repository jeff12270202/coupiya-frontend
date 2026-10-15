// ============================================================================
// app/api/ai/harness/route.ts —— Harness 运行时主梁入口（方案 A：Serverless Worker）
// ----------------------------------------------------------------------------
//   GET  /api/ai/harness   能力探测：Worker 是否已配置、插件落地状态、默认模型
//   POST /api/ai/harness   提交一次高精尖任务（工程图纸 / 复杂代码 / 方案策划…）
//
// 与前缀 /api/ai/chat 的分工（两者并存，互不干扰）：
//   /api/ai/chat    → 标准对话通道：快、轻、日常问答。始终可用。
//   /api/ai/harness → Harness 主梁：重、慢、可跑工具链与多步 Agent Loop。
//                     Worker 未部署时返回 501 并给出部署指引，绝不伪造成功。
//
// 诚实原则：Worker 未配置 ≠ 任务成功。这里宁可返回 501，也不回退成
// "假装 Harness 处理完了" —— 那会让用户在图纸类任务上拿到看似正常的垃圾结果。
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  HARNESS_PLUGINS,
  harnessConfig,
  pluginSummary,
  runHarnessTask,
  HarnessNotConfiguredError,
  type HarnessAttachment,
} from '@/lib/harness';
import { defaultModel, publicModelList } from '@/lib/ai-models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Serverless Worker 冷启动 + 长任务，给足 5 分钟

function requestId(): string {
  return crypto.randomUUID();
}

function log(level: 'info' | 'warn' | 'error', rid: string, event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'ai-harness', requestId: rid, event, ...extra });
  if (level === 'error') console.error(line);
  else console.log(line);
}

/* ---------------------------------------------------------------------------
 * GET —— 能力探测（前端用它决定是否显示"Harness 深度任务"入口）
 * ------------------------------------------------------------------------- */
export async function GET() {
  const cfg = harnessConfig();
  return NextResponse.json({
    success: true,
    ...cfg,
    plugins: HARNESS_PLUGINS,
    pluginSummary: pluginSummary(),
    models: publicModelList(),
    defaultModel: defaultModel().id,
    /** 未配置时给出一句话的部署指引，前端可直接展示 */
    guidance: cfg.configured
      ? 'Harness Worker 已连接：高精尖任务将交给运行时主梁执行。'
      : 'Harness Worker 尚未部署：设置 HARNESS_WORKER_URL 后本通道自动启用；在此之前请使用标准对话通道。',
  });
}

/* ---------------------------------------------------------------------------
 * POST —— 提交任务
 * ------------------------------------------------------------------------- */
const MAX_PROMPT_CHARS = 20_000;
const MAX_ATTACHMENTS = 8;

export async function POST(req: NextRequest) {
  const rid = requestId();

  // ---- 1. 解析请求体 ----
  let body: Record<string, unknown>;
  try {
    const parsed = (await req.json()) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, code: 'ERR_VALIDATION', message: '请求体必须是 JSON 对象', requestId: rid }, { status: 400 });
  }

  const title = String(body.title ?? '').trim().slice(0, 200);
  const category = String(body.category ?? '其他').trim().slice(0, 60);
  const prompt = String(body.prompt ?? body.message ?? '').trim().slice(0, MAX_PROMPT_CHARS);
  if (!prompt) {
    return NextResponse.json({ success: false, code: 'ERR_VALIDATION', message: '缺少 prompt（任务描述）', requestId: rid }, { status: 400 });
  }

  const attachments: HarnessAttachment[] = Array.isArray(body.attachments)
    ? (body.attachments as HarnessAttachment[]).slice(0, MAX_ATTACHMENTS)
    : [];

  // ---- 2. 会话可选：Harness 通道允许匿名试用，但记录了 userId 便于计费归属 ----
  let userId: number | undefined;
  try {
    const session = await import('@/lib/session');
    const u = await session.getSessionUser(req);
    if (u) userId = u.id;
  } catch {
    /* 未登录不阻断：Harness 通道保持开放 */
  }

  // ---- 3. 交给 Worker ----
  try {
    const result = await runHarnessTask({
      taskId: String(body.taskId ?? '').trim() || rid.slice(0, 8).toUpperCase(),
      title: title || prompt.slice(0, 40),
      category,
      prompt,
      model: typeof body.model === 'string' && body.model ? body.model : defaultModel().id,
      userId,
      attachments,
      plugins: Array.isArray(body.plugins) ? (body.plugins as number[]).slice(0, 20) : undefined,
    });

    log('info', rid, 'harness_ok', { userId, category, hasAttachments: attachments.length > 0 });
    return NextResponse.json({ ...result, requestId: rid });
  } catch (e) {
    if (e instanceof HarnessNotConfiguredError) {
      log('warn', rid, 'harness_not_configured');
      return NextResponse.json(
        {
          success: false,
          code: 'ERR_HARNESS_NOT_CONFIGURED',
          message: e.message,
          requestId: rid,
          /** 前端据此回退到 /api/ai/chat，而不是给用户一个假结果 */
          fallback: '/api/ai/chat',
          deployHint:
            '把 Harness Worker 容器部署到任一 Serverless 平台（AWS Lambda / 阿里云函数计算 / 腾讯云 SCF），' +
            '在 .env.local 设置 HARNESS_WORKER_URL 与 HARNESS_WORKER_TOKEN 即可自动启用本通道。',
        },
        { status: 501 },
      );
    }
    const msg = e instanceof Error ? e.message : '未知错误';
    log('error', rid, 'harness_failed', { error: msg });
    return NextResponse.json(
      { success: false, code: 'ERR_HARNESS_UPSTREAM', message: `Harness Worker 调用失败：${msg}`, requestId: rid },
      { status: 502 },
    );
  }
}
