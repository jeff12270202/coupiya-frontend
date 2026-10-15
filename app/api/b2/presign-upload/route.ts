// ============================================================================
// app/api/b2/presign-upload/route.ts —— B2 预签名直传（浏览器 PUT 直传 B2）
// ----------------------------------------------------------------------------
// 鉴权：登录会话 + 已开通专属 B2（未开通 → 引导先调 /api/satellite/onboard）
// 安全：文件名白名单 + 写入用户专属前缀 u{userId}/ 之下；密钥永不出服务端。
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const ALLOWED_EXT = ['txt', 'md', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'mp4', 'mp3'];
const UPLOAD_TTL = Number(process.env.B2_UPLOAD_TTL_SECONDS ?? 3600);

function makeRequestId(): string {
  return crypto.randomUUID();
}

function err(code: string, message: string, status: number, requestId: string) {
  return NextResponse.json({ success: false, code, message, requestId }, { status });
}

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();

  let sessionUser: { id: number } | null = null;
  try {
    const session = await import('@/lib/session');
    sessionUser = await session.getSessionUser(req);
  } catch {
    /* 下方统一处理 */
  }
  if (!sessionUser) return err('ERR_AUTH', '请先刷脸登录', 401, requestId);

  let filename = 'upload.txt';
  try {
    const body = (await req.json()) as { filename?: unknown };
    if (typeof body.filename === 'string' && body.filename.trim()) filename = body.filename.trim();
  } catch {
    /* 默认文件名 */
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._\u4e00-\u9fa5-]/g, '_').slice(0, 80);
  const dot = safeName.lastIndexOf('.');
  const ext = dot >= 0 ? safeName.slice(dot + 1).toLowerCase() : '';
  if (ext && !ALLOWED_EXT.includes(ext)) {
    return err('ERR_VALIDATION', `不允许的文件类型 .${ext}`, 400, requestId);
  }

  try {
    const ledger = await import('@/lib/ledger');
    const account = await ledger.prisma.b2Account.findUnique({ where: { userId: sessionUser.id } });
    if (!account) {
      return err('ERR_AUTH', '尚未开通卫星云盘，请先完成开通', 403, requestId);
    }

    const b2 = await import('@/lib/b2');
    const key = `${account.keyPrefix}${Date.now()}-${safeName}`;
    const result = await b2.presignPut(
      { keyId: account.keyId, appKey: account.applicationKey },
      account.bucket,
      key,
      'application/octet-stream',
      UPLOAD_TTL,
    );
    return NextResponse.json({
      success: true,
      uploadUrl: result.uploadUrl,
      key: result.key,
      bucket: account.bucket,
      expiresIn: UPLOAD_TTL,
      requestId,
    });
  } catch (e) {
    return err('ERR_UPSTREAM', `生成上传地址失败：${(e as Error)?.message ?? '未知错误'}`, 502, requestId);
  }
}
