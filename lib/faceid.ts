// ============================================================================
// lib/faceid.ts —— 腾讯云【增强版】人脸核身（慧眼）· 微信H5 场景
// ----------------------------------------------------------------------------
// 【为什么从「基础版 GetFaceIdToken」改成「增强版 DetectAuth」】
//   依据全部来自项目内官方 SDK 的类型定义
//   （node_modules/tencentcloud-sdk-nodejs/.../faceid/v20180301/faceid_models.d.ts）：
//
//   1. 控制台已审核通过的业务流程是「微信H5（浮层/普通模式）」，RuleId = 1。
//      该场景对应的是 DetectAuth（参数 RuleId 即「业务流程ID」），不是 GetFaceIdToken。
//
//   2. 实测证据：只传 CompareLib=BUSINESS 调用 GetFaceIdToken 时，
//      腾讯云返回 InvalidParameter（参数错误）。
//      官方定义写明：IdCard「CompareLib为商业库时必传」、Name 同理 —— 二者都没传。
//
//   3. GetFaceIdTokenResponse 的字段【只有 FaceIdToken 和 RequestId】，
//      根本不含任何 URL 字段。因此原先靠 FACEID_H5_URL_TEMPLATE 猜地址的做法无解。
//      而 DetectAuthResponse 直接返回 Url：「用于发起核身流程的URL，仅微信H5场景使用」。
//
//   4. DetectAuth 返回的 BizToken 有效期为 7200 秒；
//      基础版 FaceIdToken 只有 10 分钟且仅能核身一次。
//
// 【取结果】
//   GetDetectInfoEnhanced({ BizToken, RuleId, InfoType:'1' }) → Text.ErrCode
//   官方定义：ErrCode 为「本次流程最终验证结果」，取值 0 为成功。
//
// 【对外契约保持不变，前端 FaceAuthModal 无需改动】
//   startFaceVerify() → { ticket, verifyUrl }   // ticket = BizToken，verifyUrl = 腾讯返回的 Url
//   queryFaceResult() → { status, faceId? }
//
// 密钥：FACEID_SECRET_ID / FACEID_SECRET_KEY（缺省回退 SECRET_ID / SECRET_KEY）
// ============================================================================

import { createHash } from 'node:crypto';

const CFG = {
  secretId: process.env.FACEID_SECRET_ID || process.env.SECRET_ID || '',
  secretKey: process.env.FACEID_SECRET_KEY || process.env.SECRET_KEY || '',
  region: process.env.FACEID_REGION || 'ap-guangzhou',
  /**
   * 控制台「自助接入」中已审核通过的业务流程 ID（本账号控制台显示为 1）。
   * DetectAuth 必填，故此处给出默认值，避免漏配环境变量导致直接不可用。
   */
  ruleId: (process.env.FACEID_RULE_ID || '1').trim(),
  /** 核身完成后的回跳地址；留空则由腾讯云使用其默认页面 */
  redirectUrl: (process.env.FACEID_REDIRECT_URL || '').trim(),
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

/**
 * 由已核验的身份证号派生【稳定且不可逆】的 faceId。
 *
 * 设计理由：
 *   - 不落库明文身份证号（PII），只存哈希；
 *   - 同一人再次核身会得到相同值，因此能找回同一账号；
 *   - 盐值必须长期稳定，一旦更换将导致所有存量账号无法再被匹配。
 *     ⚠️ 请勿把 FACEID_ID_SALT 设成会轮换的值（例如 SESSION_SECRET）。
 */
function stableFaceId(idCard: string): string {
  const salt = process.env.FACEID_ID_SALT || 'coupiya-faceid-id-salt-v1';
  return 'fid_' + createHash('sha256').update(`${salt}|${idCard}`).digest('hex').slice(0, 48);
}

/**
 * 发起刷脸所需的输入。腾讯云会依据【控制台业务流程的配置】决定哪些参数必传，
 * 实测（RuleId=1）：该业务流程配置为「自传照片比对」，因此 ImageBase64 必传；
 * 若业务流程改为「权威库实名核验」，则应改为传 IdCard + Name。
 */
export type FaceVerifyInput = {
  /** 核身完成后的回跳地址（仅微信H5场景生效） */
  redirectUrl?: string;
  /** 参照照片：Base64（jpg/png，≤3MB，需带 = 补位） */
  imageBase64?: string;
  /** 身份证号（权威库实名核验时必传） */
  idCard?: string;
  /** 姓名（权威库实名核验时必传） */
  name?: string;
};

/**
 * 发起刷脸：返回核身令牌（ticket = BizToken）与腾讯云核身页 URL（verifyUrl）。
 *
 * 实测确认（2026-10-16，ap-guangzhou）：
 *   DetectAuth({ RuleId:'1', ImageBase64 }) → 成功
 *   Url = https://faceid.qq.com/api/auth/redirect?BizToken=<36位>
 *   BizToken 有效期 7200 秒。
 */
export async function startFaceVerify(input: FaceVerifyInput = {}): Promise<{ ticket: string; verifyUrl: string }> {
  const client = (await createClient()) as unknown as {
    DetectAuth: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };

  const params: Record<string, unknown> = { RuleId: CFG.ruleId };
  const redirect = (input.redirectUrl || CFG.redirectUrl || '').trim();
  if (redirect) params.RedirectUrl = redirect;
  if (input.imageBase64) params.ImageBase64 = input.imageBase64;
  if (input.idCard) params.IdCard = input.idCard;
  if (input.name) params.Name = input.name;

  let resp: Record<string, unknown>;
  try {
    resp = await client.DetectAuth(params);
  } catch (e) {
    // 把腾讯云错误码透出，便于精确定位（服务未开通 / 权限不足 / 参数不符）
    const code = String((e as { code?: string })?.code ?? '');
    const msg = String((e as { message?: string })?.message ?? e ?? '未知错误').replace(/[。.]+$/g, '');
    let hint: string;
    if (/ImageBase64/i.test(msg)) {
      hint =
        `当前业务流程 RuleId=${CFG.ruleId} 属于「自传照片比对」模式，必须先提交一张参照照片（ImageBase64）。` +
        `若希望改用「姓名 + 身份证号」的权威库实名核验，请在腾讯云控制台调整该业务流程配置或新建一个业务流程，并更新 FACEID_RULE_ID。`;
    } else if (/未开通|notopen|unopened|unsupportedoperation|serviceunavailable|resourceunavailable/i.test(`${code} ${msg}`)) {
      hint =
        `请在腾讯云控制台确认「慧眼 · 人脸核身」已开通，且业务流程 RuleId=${CFG.ruleId} 处于【已通过】状态；` +
        `并确认密钥（FACEID_SECRET_ID/KEY）所属账号与控制台一致。`;
    } else {
      hint = `请检查 FACEID 密钥权限、Region（当前 ${CFG.region}）与业务流程 RuleId（当前 ${CFG.ruleId}）是否正确。`;
    }
    throw new Error(`人脸核身服务错误[${code || 'UNKNOWN'}]: ${msg}。${hint}`);
  }

  const ticket = String(resp?.BizToken ?? '');
  const verifyUrl = String(resp?.Url ?? '');
  if (!ticket || !verifyUrl) {
    throw new Error('腾讯云未返回核身链接（Url / BizToken 缺失），请确认业务流程 RuleId 是否为微信H5场景');
  }
  return { ticket, verifyUrl };
}

/**
 * 查询核身结果（轮询用）。
 * 返回：pending（进行中）/ success（通过，附由身份证号派生的 faceId）/ failed（未通过）
 */
export async function queryFaceResult(
  token: string,
): Promise<{ status: 'pending' | 'success' | 'failed'; faceId?: string }> {
  const client = (await createClient()) as unknown as {
    GetDetectInfoEnhanced: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };

  let resp: Record<string, unknown>;
  try {
    resp = await client.GetDetectInfoEnhanced({
      BizToken: token,
      RuleId: CFG.ruleId,
      InfoType: '1', // 1 = 仅拉取文本类结果（含最终验证结果 ErrCode）
    });
  } catch (e) {
    const code = String((e as { code?: string })?.code ?? '');
    const msg = String((e as { message?: string })?.message ?? '');
    // 核身尚未完成时，腾讯会以异常形式返回「未完成」语义 → 视为进行中
    if (/unfinish|notfinished|inprogress|pending|doing|resourceunavailable|failedoperation/i.test(`${code} ${msg}`)) {
      return { status: 'pending' };
    }
    throw e;
  }

  const text = (resp?.Text ?? {}) as {
    ErrCode?: number | string | null;
    ErrMsg?: string | null;
    IdCard?: string | null;
    Name?: string | null;
    UseIDType?: number | string | null;
    IdInfoFrom?: string | null;
  };

  // ⚠️⚠️ 实测（2026-10-16）：流程【尚未完成】时，腾讯返回的是 ErrCode: null —— 不是 -1！
  //   而 JavaScript 中 Number(null) === 0，若直接 Number(ErrCode) === 0 判定成功，
  //   就会把「压根没人做过核身」误判成「核身成功」并创建账号。
  //   因此这里必须严格区分 null/undefined/空串 与 数字 0。
  const raw = text.ErrCode;
  if (raw === null || raw === undefined || raw === '') return { status: 'pending' };

  const errCode = Number(raw);
  if (errCode === -1) return { status: 'pending' };       // 流程进行中
  if (!Number.isFinite(errCode) || errCode !== 0) return { status: 'failed' };

  // ---- 已判定核身通过，接下来必须拿到【真实身份】才能建立唯一账号 ----
  // UseIDType: 0=二代身份证；1=港澳台居住证；2=其他（非合法身份号码）
  // 实测：RuleId=1 这种「自传照片比对」模式下，腾讯会把 IdCard/Name 回填成
  //       同一个随机 UUID 占位符（UseIDType=2、IdInfoFrom="其他"），它【每次核身都不同】，
  //       拿它当唯一键会导致同一个人每刷一次脸就多出一个账号。
  const useIdType = Number(text.UseIDType);
  const idCard = String(text.IdCard ?? '').trim();
  const isUuidPlaceholder = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idCard);

  if (useIdType === 2 || !idCard || isUuidPlaceholder) {
    throw new Error(
      '核身已通过，但腾讯云未返回真实身份信息（身份证字段是占位 UUID，或 UseIDType=2「其他」）。' +
        '该业务流程疑似为「自传照片比对」模式，无法据此建立唯一账号；' +
        '请在腾讯云控制台把业务流程改为「权威库实名核验（姓名 + 身份证号）」，或新建一个此类业务流程并更新 FACEID_RULE_ID。',
    );
  }

  return { status: 'success', faceId: stableFaceId(idCard) };
}
