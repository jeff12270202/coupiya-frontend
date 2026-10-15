// ============================================================================
// lib/faceid.ts —— 腾讯云【基础版】人脸核身（慧眼 FaceID）封装
// ----------------------------------------------------------------------------
// 产品规则（用户澄清版）：只做普通低级的刷脸注册（基础版），不做高级版。
// 流程：后端 GetFaceIdToken 取核身令牌 → 前端跳腾讯 H5 核身页 → 用户完成刷脸 →
//       后端 GetFaceIdResult 查询结果（轮询）→ 成功返回人脸唯一 ID（faceId）
//
// ⚠️ 待核对（SOP 28：先调研再写代码，不凭猜测）：
//   1. 接口 Action 名（GetFaceIdToken / GetFaceIdResult）与返回字段以
//      腾讯云「慧眼 FaceID · 基础版人脸核身 H5」官方文档为准；
//   2. H5 核身页 URL 模板以文档为准（本文件用环境变量 FACEID_H5_URL_TEMPLATE，
//      默认 https://faceid.qq.com/h5/verify?token={token}，请替换为实际页面）。
// 密钥：FACEID_SECRET_ID/KEY（缺省回退 SECRET_ID/KEY）——建议为核身单独建子账号。
// ============================================================================

const CFG = {
  secretId: process.env.FACEID_SECRET_ID || process.env.SECRET_ID || '',
  secretKey: process.env.FACEID_SECRET_KEY || process.env.SECRET_KEY || '',
  region: process.env.FACEID_REGION || 'ap-guangzhou',
  /** 必填：比对库类型（BUSINESS=业务侧人脸库比对 / IDCARD=公安权威比对）。基础版用 BUSINESS。 */
  compareLib: process.env.FACE_COMPARE_LIB || 'BUSINESS',
  /** H5 核身页 URL 模板（{token} 为占位符） */
  h5UrlTemplate: process.env.FACEID_H5_URL_TEMPLATE || 'https://faceid.qq.com/h5/verify?token={token}',
};

export function faceIdConfigured(): boolean {
  return CFG.secretId.length > 0 && CFG.secretKey.length > 0;
}

/** 动态初始化 FaceID 客户端（未安装 SDK → 抛错 fail-closed） */
async function createClient(): Promise<unknown> {
  if (!faceIdConfigured()) throw new Error('FACEID 凭证未配置');
  const tc = (await import('tencentcloud-sdk-nodejs')) as unknown as {
    default?: { faceid?: { v20180301?: { Client?: new (opts: unknown) => unknown } } };
    faceid?: { v20180301?: { Client?: new (opts: unknown) => unknown } };
  };
  const mod = tc.default ?? tc;
  const Client = mod.faceid?.v20180301?.Client;
  if (!Client) throw new Error('未安装 tencentcloud-sdk-nodejs（faceid v20180301）');
  return new Client({
    credential: { secretId: CFG.secretId, secretKey: CFG.secretKey },
    region: CFG.region,
    profile: { httpProfile: { endpoint: 'faceid.tencentcloudapi.com' } },
  });
}

/** 发起刷脸：返回核身令牌（ticket）与 H5 核身页 URL（⚠️ 其余可选参数以官方文档为准） */
export async function startFaceVerify(): Promise<{ ticket: string; verifyUrl: string }> {
  const client = (await createClient()) as unknown as {
    GetFaceIdToken: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  // 基础版 H5：CompareLib 为必填（BUSINESS=业务人脸库比对，不采集姓名/身份证）
  const params: Record<string, unknown> = { CompareLib: CFG.compareLib };
  // 可选透传：如有自定义规则/场景需求可配 FACEID_RULE_ID / FACEID_LIVENESS_TYPE
  const ruleId = (process.env.FACEID_RULE_ID ?? '').trim();
  if (ruleId) params.RuleId = ruleId;
  const liveness = (process.env.FACEID_LIVENESS_TYPE ?? '').trim();
  if (liveness) params.LivenessType = liveness;

  let resp: Record<string, unknown>;
  try {
    resp = await client.GetFaceIdToken(params);
  } catch (e) {
    // 把腾讯云错误码透出，便于精确定位（服务未开通 / 权限不足 / 参数不符）
    const code = String((e as { code?: string })?.code ?? '');
    const msg = String((e as { message?: string })?.message ?? e ?? '未知错误').replace(/[。.]+$/g, '');
    const hint = /未开通|notopen|unopened|unsupportedoperation|serviceunavailable|resourceunavailable/i.test(`${code} ${msg}`)
      ? '请在腾讯云控制台开通「慧眼 · 人脸核身」产品（基础版即可），并确认当前所用密钥（FACEID_SECRET_ID/KEY，缺省回退 SECRET_ID/KEY）所属账号已开通；CompareLib=BUSINESS 时如需使用自有人员库，请一并创建规则并把 RuleId 配置到 FACEID_RULE_ID。'
      : '请检查 FACEID 密钥权限、Region 与产品开通状态。';
    throw new Error(`人脸核身服务错误[${code || 'UNKNOWN'}]: ${msg}。${hint}`);
  }
  const ticket = String(resp?.FaceIdToken ?? resp?.Token ?? '');
  if (!ticket) throw new Error('人脸核身未返回令牌，请检查 FaceID 开通状态与密钥权限');
  return { ticket, verifyUrl: CFG.h5UrlTemplate.replace('{token}', encodeURIComponent(ticket)) };
}

/**
 * 查询核身结果（轮询用）。
 * 返回：pending（进行中）/ success（通过，附人脸唯一 faceId）/ failed（未通过）
 * ⚠️ 状态字段名以官方文档为准，本实现兼容 Result=Success/Fail 与 Pending 异常码。
 */
export async function queryFaceResult(
  token: string,
): Promise<{ status: 'pending' | 'success' | 'failed'; faceId?: string }> {
  const client = (await createClient()) as unknown as {
    GetFaceIdResult: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  let resp: Record<string, unknown>;
  try {
    resp = await client.GetFaceIdResult({ FaceIdToken: token });
  } catch (e) {
    const code = String((e as { code?: string })?.code ?? '');
    // 核身尚未完成/处理中：按文档的进行中错误码判定（⚠️ 以文档为准）
    if (code.includes('IN_PROGRESS') || code.includes('PENDING') || code.includes('ResourceUnavailable')) {
      return { status: 'pending' };
    }
    throw e;
  }
  const result = String(resp?.Result ?? '');
  if (/^(SUCCESS|Success)$/.test(result)) {
    const faceId = String(resp?.FaceId ?? resp?.PersonId ?? resp?.IdCard ?? '');
    return { status: 'success', faceId };
  }
  return { status: 'failed' };
}
