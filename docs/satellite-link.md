# 星链接入口 · 交付说明与合规对接手册（satellite）

> 页面：`app/satellite/page.tsx`（全站开放浏览；开通/上传需刷脸登录）
> 后端：`app/api/satellite/{onboard,status}` + `app/api/b2/{presign-upload,presign-download}` + `lib/b2.ts`
> 数据：`prisma B2Account`（每用户一行：bucket/bucketId/keyId/applicationKey/keyPrefix，密钥仅服务端密存）

## 1. 已落地（今日）

| 模块 | 说明 |
| :-- | :-- |
| 真实边界科普 | 星链需硬件 / 直连仅限特定机型+SMS / 天通区域覆盖 / 北斗窄带 —— 杜绝虚假宣传 |
| 手机直连检测 | 纯前端机型库判定（星链直连试点机型 + 国内天通/北斗机型），无后端请求 |
| 硬件导流 | Starlink 官方链接（非官方分销）+ 安装要点 |
| 双引擎 + 短信 AI | 架构展示 + 无网缩传逻辑（指令短信 → AI → 短信摘要 + 网络分发） |
| 专家转包/工单 | 状态公示（建设中），架构见本文件第 3 节 |
| **卫星云盘（B2 自动配置）** | 开通 = 自动创建 allPrivate 专属桶 + CORS（仅站点域名）+ 受限密钥（前缀隔离），浏览器预签名直传实测 + 限时下载 |

## 2. 环境变量（服务端 `.env.local`，⚠️ 严禁 VITE_ 前缀暴露密钥）

```
B2_APPLICATION_KEY_ID=平台主密钥 ID
B2_APPLICATION_KEY=平台主密钥（只显示一次，妥善保存）
B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
B2_REGION=us-east-005
B2_API_BASE=https://api.backblazeb2.com
B2_BUCKET_PREFIX=coupiya-ugc
B2_ALLOWED_ORIGINS=https://coupiya.com,https://www.coupiya.com,http://localhost:3000
B2_UPLOAD_TTL_SECONDS=3600
B2_DOWNLOAD_TTL_SECONDS=3600
```
- 部署：`npx prisma generate`（已随 schema 更新）→ 上线前 `npx prisma db push`（新建 b2_accounts 表）。
- 主密钥能力需含：createBucket、createKey、listBuckets（受限子钥由平台代建）。

## 3. 未落地（合规商务对接 → 分期开发）

| 模块 | 状态 | 依赖 |
| :-- | :-- | :-- |
| 天通 API（收短信转工单） | 商务对接中 | 中国电信政企 B2B 接口（实名/企业资质） |
| 新消息 Claw（国内短信触发 AI） | 商务对接中 | 中国移动通道 APIKey |
| T-Mobile Direct to Cell 网关 | 不可直接 API | 需经授权分销商企业套餐 |
| 短信工单系统/专家库 | 架构设计中 | 见上文后端路由骨架（工单表 gen_tasks + 规则引擎 + 分派引擎） |
| 成品分发 | 已具备 | B2 限时下载链接（1h，可调），后续可加 Cloudflare CDN 免流量 |

## 4. 安全要点（必须遵守）

1. **密钥绝不进前端**：任何 `VITE_B2_*` 都会打包进浏览器 = 公开泄露。只读服务端 `B2_*`。
2. **每用户独立受限密钥**：namePrefix=`u{userId}/`，capabilities 最小化（list/read/share/write/delete files），越权前缀由服务端二次校验（presign-download 校验 key 前缀）。
3. **CORS 只开三个源 + s3_put/get/head**；新规则全球边缘生效约 10-15 分钟，期间直传可能被浏览器拦截（前端已如实提示）。
4. **生命周期**：可在 B2 控制台按需设置 3 天隐藏/3 天删除规则防存储膨胀（本仓库不代设，避免误删用户素材）。
5. **合规话术**：平台=增值服务商/导流，不宣称"点一下就能上网"，不私自转售硬件。
