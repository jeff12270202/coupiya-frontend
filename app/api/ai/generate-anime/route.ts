// ============================================================================
// app/api/ai/generate-anime/route.ts —— AI 动漫生图（已迁移到共享引擎）
// 生产级实现全部在 lib/ai-image.ts；本文件仅保留动漫业务配置。
// 行为与迁移前完全一致：默认 1024 方图、二次元提示词、trinart 动漫模型兜底。
// ============================================================================

import { createImageGenHandler } from '@/lib/ai-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = createImageGenHandler({
  namespace: 'anime',
  defaultDim: 1024,
  placeholderText: '动漫生成服务繁忙',
  promptSystemEnv: 'ANIME_PROMPT_OVERRIDE', // 可用环境变量整体覆盖二次元提示词
  promptSystem: [
    '你是一个资深的二次元提示词工程师。请将用户的描述转化为适合 Stable Diffusion 等 AI 绘图模型生成动漫/二次元插画的高质量英文提示词。',
    '要求：直接输出英文提示词，包含画质词（masterpiece, best quality）、风格词（anime style, detailed）、主体细节，不要包含任何解释、对话、引号或多余的说明。',
  ].join(''),
  hfEndpoint: 'https://api-inference.huggingface.co/models/naclbit/trinart_stable_diffusion_v2',
  cosKeyPrefix: 'ai-anime',
  replicatePollAttempts: 20,
  deepseekMaxTokens: 200,
});
