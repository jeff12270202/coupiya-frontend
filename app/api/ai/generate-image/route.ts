// ============================================================================
// app/api/ai/generate-image/route.ts —— AI 图片生成（纹样/通用生图）
// 生产级实现全部在 lib/ai-image.ts（限流/超时/校验/COS 持久化/四层降级/日志）
// 本文件只负责：本路由的业务配置（提示词风格、HF 兜底模型、COS 前缀、默认尺寸）
// ============================================================================

import { createImageGenHandler } from '@/lib/ai-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = createImageGenHandler({
  namespace: 'gen-image',
  defaultDim: 512,
  placeholderText: '生成服务繁忙',
  promptSystem: [
    '你是一个资深的 AI 绘画提示词优化工程师。请将用户的描述转化为适合 AI 绘图模型生成高质量图片的英文提示词。',
    '要求：直接输出英文提示词，包含画质词（masterpiece, best quality）、风格描述、光影与主体细节。不要包含任何解释、对话、引号或多余说明。',
  ].join(''),
  hfEndpoint: 'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1',
  cosKeyPrefix: 'ai-images',
});
