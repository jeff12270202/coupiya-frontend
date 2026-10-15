# Coupiya 全球 AI 影视创作 SaaS · 生产环境落地清单（A100/LTX-2.3 阶段）

> 本文件是把「规划内容」映射为仓库内可执行项的**唯一总账**。凡标注【今日已落地】的项
> 均已在本仓库实现并部署；标注【GPU 阶段】的项 = 需先在腾讯云购入 GPU 实例，再按本
> 文件步骤接入（代码侧已留好接口/文档锚点，**绝不 fake 占位结果**）。

## 0. 环境现实（必须遵守）

- 本地 PVE（4 核 8G，VM 120/121/100119 等）只承载：前端页面、用户/账本/订单（Prisma）、
  任务调度与 API 网关层。**绝不运行大模型推理**。
- 腾讯云 GPU 实例（GN10Xp/GT4：A100 80G 高并发 / V100 32G 单任务）作为**算力节点**，
  与 PVE 通过内网/API 互通（IP 清单见 PVE：host 10.136.131.191、VM120 10.136.131.169 等）。

## 1. 前端「AI-WORDPRESS 创作工坊 · DNA 粒子交互层」【今日已落地】

| 文件 | 说明 |
| :-- | :-- |
| `components/DnaStudio.tsx` | Three.js(WebGL) DNA 双螺旋粒子画布：六大工位发光节点螺旋游走、悬停高亮、点击选中；引擎状态角标；无 WebGL 自动降级为工位清单（无障碍）。依赖 `three`（已 npm install）。 |
| `app/ai-wordpress/page.tsx` | 创作工坊页左侧嵌入 DNA 画布；节点动作真实接线：剧本工位→AI 聊天、分镜工位→AI 文生图、视频工位→创作门槛后的一键生成、发布工位→个人中心；配音/4K 工位标注「引擎接入中」。 |
| 六大工位 | ①剧本(DeepSeek/混元) ②分镜(文生图) ③视频(LTX-2.3 待接入/今日平台网关) ④配音(MiniMax/TTS 待接入) ⑤4K增强剪辑(WAND 待接入) ⑥全球发布(VOD+WP 已闭环) |

## 2. 腾讯云 GPU 算力节点（底盘）【GPU 阶段 · 今日预留锚点】

执行顺序：
1. 腾讯云购买 **GN10Xp（A100 80G）1 台 + GT4（V100 32G）1 台**（镜像勾选自动装 GPU 驱动），
   与 PVE 同一内网/VPC 或打通隧道；按量计费起步验证 → 稳定后转包年。
2. `ssh` 进入实例，安装：`conda`/Python3.11、`pytorch-cuda`、`uv`；
   部署 **ComfyUI**：`git clone https://github.com/comfyanonymous/ComfyUI`，装依赖；
   装 **ComfyUI-GGUF**（city96）与 **ComfyUI-Custom-Scripts**。
3. 下载模型（建议提前在海外区域/对象存储中转）：`ltx-2.3-22b-dev-Q4_K_M.gguf`（unsloth 量化）
   → `ComfyUI/models/checkpoints/`；文本编码器 Gemma-3-12B → `models/text_encoders/`。
4. 启动：`python main.py --listen 0.0.0.0 --port 8188`，nginx 反代 + 加 `COMFY_API_KEY` 鉴权
   （或专用 VPC 内网访问）。验证：浏览器打开工作流，选 LTX-2.3 模板生成 5s 样片。

代码锚点（本仓库已留）：
- `lib/ai-video-engines.ts` → `submitComfyLtxJob()`：配置 `COMFY_API_BASE / COMFY_API_KEY`
  后按 TODO 注释实现 `/prompt` 提交与 `/history` 轮询。
- 生成产物落地 COS 后走既有发布闸门 `POST /api/ai/publish-vod-movie`（含 author_user_id）。

## 3. 任务调度（异步队列，防高并发打挂）【GPU 阶段 · 架构已定】

- 方案：用户点击生成 → 创建任务（DB 表 `gen_tasks` 或复用流水 relatedId）→ 入队
  **腾讯云 CMQ（或自建 Redis Queue）** → GPU 节点 Worker 消费 → 进度/结果回写 →
  前端 `task_id` 轮询（或 WebSocket 推送）→ 完成后展示"发布确认"。
- 前端已具备轮询与状态机范式：`VideoModal` 的四步流水线 + `/api/ai/ugc-upload-ticket`
  预签名直传（密钥零落地工作区）。
- 需新增（GPU 阶段）：`app/api/ai/tasks/route.ts`（建任务）、Worker 脚本（部署在 GPU 节点旁）。

## 4. WordPress / 页面入口【今日已落地】

- 电影墙/工坊页入口：`app/ai-wordpress/page.tsx`、`app/blog/page.tsx`；
- 上墙元数据 REST：`wordpress/functions-additions.php`（author_user_id 等 6 个 meta +
  `coupiya/v1/movies` 按作者查询）；电影墙作者真名化：`lib/use-author-names.ts`。

## 5. 商业化闭环【今日已落地】

- 充值：`app/recharge/page.tsx`（套餐 $5–$50，$1=100 Credits 锚点）+ PayPal（下单/捕获/
  Webhook 验签）+ 万里汇（下单/Webhook HMAC 验签）；到账幂等：`lib/payments.ts`。
- 扣费：`lib/ledger.ts`（事务双写）；发布闸门：`/api/ai/publish-vod-movie`（先扣费→VOD→上墙，
  失败自动退款）；个人中心：`app/account/page.tsx`。

## 6. 用户/认证【今日已落地】

- 刷脸注册登录（腾讯云基础版人脸核身）：`app/api/auth/face/{start,result}` + `lib/faceid.ts` +
  `lib/session.ts`（HttpOnly HMAC Cookie）；`/api/auth/me`、`/api/auth/logout`。

## 7. 极客空间（Cloud Studio）【今日已落地】

- `app/api/create-ugc-studio/route.ts`（CreateWorkspace + 环境变量注入 + HMAC 发布令牌）、
  `cloud-studio-template/main.py`（自动化保姆：检测 output.mp4→预签名上传→打印发布链接）。

## 8. 全球加速与可观测（CDN/监控）【GPU 阶段】

- 媒体/CDN：腾讯云 COS（`COS_BUCKET/COS_REGION` 已用）+ CDN；VOD 播放域名启用 CDN。
- 监控：Prometheus + Grafana 抓取 Node/GPU 指标（`nvidia-smi` exporter）；错误日志已全链路
  JSON（svc/event/requestId），接 Sentry 或腾讯云 CLS。

## 9. 上线检查清单（GPU 接入后逐项打勾）

- [ ] A100/V100 购买 + 驱动 + ComfyUI + LTX-2.3 样片生成通过
- [ ] `.env` 增加：`COMFY_API_BASE` / `COMFY_API_KEY` / `COS_BUCKET` / `COS_REGION`
- [ ] `submitComfyLtxJob()` TODO 实现 + `comfy-workflow-ltx23.json` 模板入库
- [ ] `gen_tasks` 表 + CMQ/Redis Worker + `/api/ai/tasks` 轮询接口
- [ ] WAND 后处理（4K/配音）接入链路
- [ ] GPU 成本周对账（SOP 64）+ 免费额度/会员策略（SOP 70）

> 原则重申：任何引擎未接入前，前端与 API 一律如实提示"引擎接入中/请稍后再试"，
> 绝不用假视频/假结果冒充生成成功。
