// ============================================================================
// app/api/ai/generate/route.ts —— AI 通用生图（第一版路由，已迁移到共享引擎）
// 生产级实现全部在 lib/ai-image.ts；本文件仅保留业务配置。
// 行为与迁移前完全一致：默认 512 方图、通用绘画提示词、SD-2-1 兜底。
// ============================================================================

import { createImageGenHandler } from '@/lib/ai-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = createImageGenHandler({
  namespace: 'gen',
  defaultDim: 512,
  placeholderText: '生成服务繁忙',
  promptSystem: [
    '你是一个资深的 AI 绘画提示词工程师。请将用户的描述转化为适合 Stable Diffusion 或 Midjourney 等 AI 绘图模型生成高质量图片的英文提示词。',
    '要求：直接输出英文提示词，必须包含画质词（masterpiece, best quality）、风格描述、光影与主体细节，不要包含任何解释、对话、引号或多余的说明。',
  ].join(''),
  hfEndpoint: 'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1',
  cosKeyPrefix: 'ai-images',
});
