// ============================================================================
// lib/b2.ts —— Backblaze B2 服务端封装（建桶 / 受限密钥 / S3 预签名）
// ----------------------------------------------------------------------------
// 职责（星链接入口 · 用户开通卫星服务 → 自动配置专属 B2 空间）：
//   1. 平台主密钥（B2_APPLICATION_KEY_ID/KEY）仅存服务端 .env.local；
//      ⚠️ 严禁用 VITE_ 前缀暴露到浏览器（客户端密钥=公开泄露）
//   2. 为每个用户创建 allPrivate 专属桶 + 受限应用密钥（namePrefix 隔离 +
//      最小 capabilities），互不可见
//   3. CORS 规则随桶写入：仅允许网站正式域名与 localhost:3000 的 s3_put/get/head
//   4. 预签名 URL 用官方 @aws-sdk（forcePathStyle 必须 true）
// 原生 API 文档：api.backblazeb2.com/b2api/v2/b2_authorize_account 等。
// ============================================================================

const CFG = {
  keyId: process.env.B2_APPLICATION_KEY_ID ?? '',
  appKey: process.env.B2_APPLICATION_KEY ?? '',
  apiBase: (process.env.B2_API_BASE ?? 'https://api.backblazeb2.com').replace(/\/+$/, ''),
  s3Endpoint: (process.env.B2_ENDPOINT ?? 'https://s3.us-east-005.backblazeb2.com').replace(/\/+$/, ''),
  region: process.env.B2_REGION ?? 'us-east-005',
  bucketPrefix: (process.env.B2_BUCKET_PREFIX ?? 'coupiya-ugc').toLowerCase().replace(/[^a-z0-9-]/g, ''),
  allowedOrigins: (process.env.B2_ALLOWED_ORIGINS ?? 'https://coupiya.com,https://www.coupiya.com,http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export function b2Configured(): boolean {
  return CFG.keyId.length > 0 && CFG.appKey.length > 0;
}

/**
 * 云盘生命周期策略 —— 与写入 B2 的 lifecycleRules 必须保持一致。
 * 单一事实来源：改这里就等于同时改了「桶上真实生效的规则」和「前端倒计时的口径」，
 * 不会出现"页面显示 3 天、B2 实际 30 天"这种对不上的情况。
 */
export const LIFECYCLE = {
  /** 上传后多少天进入「隐藏」阶段（不可再下载，但仍占配额） */
  hideAfterDays: 3,
  /** 隐藏后多少天被 B2 彻底删除 */
  deleteAfterHideDays: 3,
} as const;

interface B2Auth {
  accountId: string;
  authorizationToken: string;
  apiUrl: string;
  downloadUrl: string;
}

/** 平台主密钥授权（每次请求前调用；token 有效期 24h，此处按需获取） */
export async function b2AuthorizeAccount(): Promise<B2Auth> {
  if (!b2Configured()) throw new Error('B2_APPLICATION_KEY_ID/B2_APPLICATION_KEY 未配置（服务端 .env.local）');
  const res = await fetch(`${CFG.apiBase}/b2api/v2/b2_authorize_account`, {
    method: 'GET',
    headers: { Authorization: `Basic ${Buffer.from(`${CFG.keyId}:${CFG.appKey}`).toString('base64')}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`B2 授权失败（HTTP ${res.status}）: ${String(data.message ?? data.code ?? '')}`);
  }
  const storage = (data.apiInfo as Record<string, unknown> | undefined)?.storageApi as
    | Record<string, unknown>
    | undefined;
  return {
    accountId: String(data.accountId ?? ''),
    authorizationToken: String(data.authorizationToken ?? ''),
    apiUrl: String((storage?.apiUrl as string) ?? data.apiUrl ?? ''),
    downloadUrl: String((storage?.downloadUrl as string) ?? data.downloadUrl ?? ''),
  };
}

async function b2Post(auth: B2Auth, action: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${auth.apiUrl}/b2api/v2/${action}`, {
    method: 'POST',
    headers: {
      Authorization: auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`${action} 失败（HTTP ${res.status}）: ${String(data.message ?? data.code ?? '')}`);
  }
  return data;
}

export interface UserB2Space {
  bucket: string;
  bucketId: string;
  keyId: string;
  /** 受限密钥（仅创建时返回一次 → 由调用方加密入库，绝不下发前端） */
  applicationKey: string;
  keyPrefix: string;
}

/**
 * 为用户创建专属私有桶 + 受限密钥（开通卫星服务时调用；幂等由调用方保证）。
 * @param userId 网站用户 ID
 */
export async function createUserB2Space(userId: number): Promise<UserB2Space> {
  const auth = await b2AuthorizeAccount();
  if (!auth.apiUrl || !auth.accountId) throw new Error('B2 授权响应缺少 apiUrl/accountId');

  const bucketName = `${CFG.bucketPrefix}-${userId}-${Math.floor(Date.now() / 1000).toString(36)}`;
  const bucket = await b2Post(auth, 'b2_create_bucket', {
    accountId: auth.accountId,
    bucketName,
    bucketType: 'allPrivate',
    corsRules: [
      {
        corsRuleName: 'web-upload-rule',
        allowedOrigins: CFG.allowedOrigins,
        allowedOperations: ['s3_head', 's3_get', 's3_put'],
        allowedHeaders: [],
        exposeHeaders: [],
        maxAgeSeconds: 3600,
      },
    ],
    // 生命周期：上传后 3 天隐藏（不可下载但仍计费）、再 3 天彻底删除。
    // 这条规则是真的写给 B2 的，不是前端文案 —— 没有它，"3 天隐藏 + 3 天删除"
    // 就只是一句承诺，文件会永远留在桶里。fileNamePrefix 留空 = 作用于整桶。
    lifecycleRules: [
      {
        fileNamePrefix: '',
        daysFromUploadingToHiding: LIFECYCLE.hideAfterDays,
        daysFromHidingToDeleting: LIFECYCLE.deleteAfterHideDays,
      },
    ],
  });

  const keyPrefix = `u${userId}/`;
  const key = await b2Post(auth, 'b2_create_key', {
    accountId: auth.accountId,
    capabilities: ['listFiles', 'readFiles', 'shareFiles', 'writeFiles', 'deleteFiles'],
    keyName: `user-${userId}-b2`,
    bucketId: String(bucket.bucketId ?? ''),
    namePrefix: keyPrefix,
  });

  const applicationKeyId = String(key.applicationKeyId ?? key.keyId ?? '');
  const applicationKey = String(key.applicationKey ?? '');
  if (!bucketName || !applicationKeyId || !applicationKey) {
    throw new Error('B2 建桶/建钥响应不完整，请检查主密钥权限（需 createBucket/createKey）');
  }

  return {
    bucket: bucketName,
    bucketId: String(bucket.bucketId ?? ''),
    keyId: applicationKeyId,
    applicationKey,
    keyPrefix,
  };
}

/* ---------------- S3 预签名（@aws-sdk；forcePathStyle 必须 true） ---------------- */

interface S3Creds {
  keyId: string;
  appKey: string;
}

export interface PresignPutResult {
  uploadUrl: string;
  key: string;
}

/** 生成用户浏览器直传的预签名 PUT URL */
export async function presignPut(
  creds: S3Creds,
  bucket: string,
  key: string,
  contentType: string,
  expiresIn: number,
): Promise<PresignPutResult> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = new S3Client({
    region: CFG.region,
    endpoint: CFG.s3Endpoint,
    credentials: { accessKeyId: creds.keyId, secretAccessKey: creds.appKey },
    forcePathStyle: true, // B2 必须
  });
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  return { uploadUrl, key };
}

/** 生成带时效的下载链接（GetObject 预签名） */
export async function presignGet(
  creds: S3Creds,
  bucket: string,
  key: string,
  expiresIn: number,
): Promise<string> {
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = new S3Client({
    region: CFG.region,
    endpoint: CFG.s3Endpoint,
    credentials: { accessKeyId: creds.keyId, secretAccessKey: creds.appKey },
    forcePathStyle: true,
  });
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn });
}

/** 桶名合法性（小写字母数字连字符） */
export function sanitizeBucketPrefix(): string {
  return CFG.bucketPrefix;
}

/* ---------------- 列目录（星链接入口的「我的卫星云盘」文件列表） ---------------- */

export interface DriveObject {
  key: string;
  /** 短名（去掉 u<id>/ 前缀，便于前端直显） */
  name: string;
  size: number;
  /** ISO 字符串 */
  lastModified: string;
  /** 生命周期到期时间（ISO），由调用方按 bucket 规则计算 */
  expireAt: string;
  /** 到期前进入"隐藏"阶段的起点（ISO） */
  hideAt: string;
}

/**
 * 列出用户专属桶中、其受限密钥可见范围内的对象。
 *
 * 安全性：使用【用户自己的受限密钥】而非平台主密钥 —— 该密钥带 namePrefix
 * 且 capabilities 只有 listFiles/readFiles/writeFiles/shareFiles/deleteFiles，
 * 因此即使前缀被篡改，也无法越权读取其他用户的文件。
 *
 * 返回的 key 列表只含元数据，不含任何可下载凭证；下载链接必须另行换取。
 */
export async function listUserObjects(
  creds: S3Creds,
  bucket: string,
  prefix: string,
  limit = 200,
): Promise<DriveObject[]> {
  const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: CFG.region,
    endpoint: CFG.s3Endpoint,
    credentials: { accessKeyId: creds.keyId, secretAccessKey: creds.appKey },
    forcePathStyle: true,
  });
  const out = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: Math.min(Math.max(limit, 1), 1000) }),
  );

  const DAY = 24 * 60 * 60 * 1000;
  const totalDays = LIFECYCLE.hideAfterDays + LIFECYCLE.deleteAfterHideDays;
  return (out.Contents ?? [])
    .map((o) => {
      const key = String(o.Key ?? '');
      const lastModified = (o.LastModified ?? new Date()).toISOString();
      const t = new Date(lastModified).getTime();
      return {
        key,
        name: key.startsWith(prefix) ? key.slice(prefix.length) : key,
        size: Number(o.Size ?? 0),
        lastModified,
        hideAt: new Date(t + LIFECYCLE.hideAfterDays * DAY).toISOString(),
        expireAt: new Date(t + totalDays * DAY).toISOString(),
      };
    })
    .filter((o) => o.key.length > 0 && !o.key.endsWith('/'))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

/**
 * 删除用户自己前缀下的单个对象。
 * 调用方【必须】先校验 key.startsWith(account.keyPrefix)，本函数不做越权判断 ——
 * 因为"谁能删什么"属于业务鉴权，不属于存储层职责。
 */
export async function deleteUserObject(creds: S3Creds, bucket: string, key: string): Promise<void> {
  const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: CFG.region,
    endpoint: CFG.s3Endpoint,
    credentials: { accessKeyId: creds.keyId, secretAccessKey: creds.appKey },
    forcePathStyle: true,
  });
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
