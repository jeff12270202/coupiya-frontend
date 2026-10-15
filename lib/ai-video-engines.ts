// ============================================================================
// lib/ai-video-engines.ts —— AI 视频算力引擎接入层（平台网关 ⇄ ComfyUI/LTX-2.3）
// ----------------------------------------------------------------------------
// 当前状态（今日落地）：
//   引擎路由已就绪：环境变量未配置 COMFY_API_BASE/COMFY_API_KEY 时，视频生成
//   继续走现有平台网关（/api/ai/generate-video：Pollinations → Replicate），
//   一切失败诚实报错，绝不 fake。
//
// 待 GPU 接入（腾讯云 A100/V100 实例到位后，按 docs/ai-cinema-saas-rollout.md
// 第 2 阶段完成，再回来填充 submitComfyLtxJob 内的调用实现）：
//   1. ComfyUI 节点：加载 ltx-2.3-22b-dev-Q4_K_M.gguf（或 FP8）工作流
//   2. 队列：腾讯云 CMQ / Redis 任务队列（生成异步，前端轮询任务状态）
//   3. 后处理：腾讯云 WAND（4K 增强、多语种配音、智能编码）
//   4. 产物：直接落地 COS，再走 /api/ai/publish-vod-movie 发布闸门
// ============================================================================

export type VideoEngineId = 'platform-gateway' | 'comfy-ltx23';

export interface EngineMeta {
  id: VideoEngineId;
  label: string;
  model: string;
  hardware: string;
}

export const VIDEO_ENGINES: Record<VideoEngineId, EngineMeta> = {
  'platform-gateway': {
    id: 'platform-gateway',
    label: '平台生成网关（今日可用）',
    model: 'Pollinations / Replicate SVD',
    hardware: '腾讯云 / 第三方云端 API',
  },
  'comfy-ltx23': {
    id: 'comfy-ltx23',
    label: 'ComfyUI + LTX-2.3 22B（待接入）',
    model: 'ltx-2.3-22b-dev（GGUF Q4_K_M / FP8）',
    hardware: '腾讯云 GN10Xp/GT4（A100 80G 或 V100 32G）',
  },
};

/** 当前生效引擎：配置了 ComfyUI 端点即切换，否则走平台网关 */
export function getActiveVideoEngine(): VideoEngineId {
  const base = (process.env.COMFY_API_BASE ?? '').trim();
  const key = (process.env.COMFY_API_KEY ?? '').trim();
  return base && key ? 'comfy-ltx23' : 'platform-gateway';
}

export interface ComfyLtxJobParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  fps?: number;
  seconds?: number;
  seed?: number;
  /** LTX-2.3 原生音画同步：true 时生成含同步音轨 */
  audio?: boolean;
  requestId: string;
}

/**
 * 提交 ComfyUI LTX-2.3 任务（⚠️ GPU 节点上线后实现 HTTP 调用；当前 fail-closed）。
 * 返回 { taskId } 供前端轮询；未配置引擎时抛错（绝不静默降级到假结果）。
 */
export async function submitComfyLtxJob(params: ComfyLtxJobParams): Promise<{ taskId: string }> {
  const base = (process.env.COMFY_API_BASE ?? '').trim();
  const key = (process.env.COMFY_API_KEY ?? '').trim();

  if (!base || !key) {
    throw new Error(
      `LTX-2.3 算力引擎尚未接入（待腾讯云 A100 实例 + ComfyUI 部署后配置 COMFY_API_BASE / COMFY_API_KEY）。requestId=${params.requestId}`,
    );
  }
  // TODO(GPU 阶段)：按 ComfyUI /prompt 协议提交工作流 JSON（workflow 模板放
  // docs/ 或模板目录），轮询 /history 取产物，落地 COS 后返回 COS key。
  // 当前代码路径不可达（未配置即抛错），保证“接口存在但不谎报”。
  void key;
  void params;
  throw new Error(`ComfyUI 适配器待实现（GPU 阶段）。requestId=${params.requestId}`);
}
