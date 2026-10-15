// ============================================================================
// lib/ai-models.ts —— 全站模型注册表（唯一事实来源）
// ----------------------------------------------------------------------------
// 为什么必须有这个文件：
//   改版前，模型名在 4 个地方各写一份（FloatingChat / AIChatModal /
//   TaskModal / api/ai/chat 的 modelAliases），彼此不一致 —— 前端下拉里写着
//   DeepSeek-V3，后端却把它映射到 R1，用户看到的和实际跑的根本不是一个模型。
//
//   现在只有这里定义"有哪些模型、上游真实 ID 是什么"，其他所有地方 import。
//   加一个模型 = 改这一个文件；换上游 ID = 改一个环境变量，零代码改动。
//
// 关于 DeepSeek 最新模型（据官方公告）：
//   · deepseek-chat / deepseek-reasoner 已于 7 月 24 日停用
//   · 官方要求迁移到 V4 系列（Flash / Pro 双模型）
//   → 因此本表把 V4 设为默认，旧模型名保留为"兼容别名"以不打断已有会话。
//
// ⚠️ 上游 ID 全部可用环境变量覆盖：如果你自建的 Hermes 网关用的名字不同，
//    改 .env.local 即可，不需要动代码。
// ============================================================================

export type ModelVendor = 'deepseek' | 'openai-compatible';
export type ModelTier = 'flagship' | 'efficient' | 'legacy';

export interface ModelSpec {
  /** 前端选择器的 value，同时也是提交给 /api 的 model 字段 */
  id: string;
  /** 人类可读名称 */
  label: string;
  /** 真正发给上游的 model 参数 */
  upstream: string;
  vendor: ModelVendor;
  tier: ModelTier;
  /** 一句话定位，用于 UI 副标题 */
  desc: string;
  supportsVision: boolean;
  supportsTools: boolean;
}

/** 读取环境变量；空白字符串视为"未设置"，回落到默认值 */
function env(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v.trim() : fallback;
}

/**
 * 模型清单。
 * 注意：upstream 用函数惰性求值 —— 这些值必须在 Next.js 运行时读取 .env，
 * 不能在模块被 import 的那一瞬间就固化成构建期的值（否则改了环境变量要重新构建）。
 */
export const MODELS: ReadonlyArray<ModelSpec> = [
  {
    id: 'DeepSeek-V4-Pro',
    label: 'DeepSeek V4 Pro',
    upstream: env('DS_MODEL_V4_PRO', 'deepseek/deepseek-v4-pro'),
    vendor: 'deepseek',
    tier: 'flagship',
    desc: '旗舰 · 复杂推理 / 工程图纸 / 架构设计',
    supportsVision: true,
    supportsTools: true,
  },
  {
    id: 'DeepSeek-V4-Flash',
    label: 'DeepSeek V4 Flash',
    upstream: env('DS_MODEL_V4_FLASH', 'deepseek/deepseek-flash'),
    vendor: 'deepseek',
    tier: 'efficient',
    desc: '高效 · 日常问答 / 文案 / 快速响应',
    supportsVision: true,
    supportsTools: true,
  },
  {
    id: 'GPT-6-Compat',
    label: 'GPT-6 兼容通道',
    upstream: env('GPT6_MODEL', 'gpt-6-sol'),
    vendor: 'openai-compatible',
    tier: 'flagship',
    desc: 'OpenAI 兼容协议 · 需网关已接入并配好密钥',
    supportsVision: true,
    supportsTools: true,
  },
  // ---- 兼容层：旧名字继续可用，但会明确提示"已映射"，不让用户以为跑的是新模型 ----
  {
    id: 'DeepSeek-R1',
    label: 'DeepSeek R1（旧名 · 兼容）',
    upstream: env('DS_MODEL_R1', 'deepseek/deepseek-r1'),
    vendor: 'deepseek',
    tier: 'legacy',
    desc: '旧模型名，保留以不打断已有会话',
    supportsVision: false,
    supportsTools: true,
  },
  {
    id: 'DeepSeek-V3',
    label: 'DeepSeek V3（旧名 · 兼容）',
    upstream: env('DS_MODEL_V3', 'deepseek/deepseek-v3'),
    vendor: 'deepseek',
    tier: 'legacy',
    desc: '旧模型名，保留以不打断已有会话',
    supportsVision: false,
    supportsTools: true,
  },
];

/** 默认模型（可被 DEFAULT_CHAT_MODEL 覆盖；默认取 V4 Pro） */
export function defaultModel(): ModelSpec {
  const wanted = env('DEFAULT_CHAT_MODEL', 'DeepSeek-V4-Pro');
  return MODELS.find((m) => m.id === wanted || m.upstream === wanted) ?? MODELS[0]!;
}

/**
 * 构建「显示名 → 上游 ID」映射，供 /api/ai/chat 的 modelAliases 使用。
 * 同时接受大小写不敏感的简写，减少前端写错名字导致的静默回落。
 */
export function buildModelAliases(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of MODELS) {
    out[m.id] = m.upstream;
    out[m.id.toLowerCase()] = m.upstream;
    out[m.upstream] = m.upstream;
  }
  // 常见手写变体 → 对应上游
  out['deepseek-v4-pro'] = env('DS_MODEL_V4_PRO', 'deepseek/deepseek-v4-pro');
  out['deepseek-v4-flash'] = env('DS_MODEL_V4_FLASH', 'deepseek/deepseek-v4-flash');
  out['v4-pro'] = env('DS_MODEL_V4_PRO', 'deepseek/deepseek-v4-pro');
  out['v4-flash'] = env('DS_MODEL_V4_FLASH', 'deepseek/deepseek-v4-flash');
  out['gpt-6'] = env('GPT6_MODEL', 'gpt-6-sol');
  return out;
}

/** 给前端用的精简清单（不含上游 ID，避免把内部路由暴露到浏览器） */
export function publicModelList(): Array<Pick<ModelSpec, 'id' | 'label' | 'tier' | 'desc' | 'supportsVision' | 'supportsTools'>> {
  return MODELS.map(({ id, label, tier, desc, supportsVision, supportsTools }) => ({
    id,
    label,
    tier,
    desc,
    supportsVision,
    supportsTools,
  }));
}

/* ============================================================================
 * DeepSeek 官方 API（api.deepseek.com）的模型 ID
 * ----------------------------------------------------------------------------
 * ⚠️ 与上面 MODELS 的 upstream 是【两套不同的命名空间】，不要混用：
 *      · MODELS[].upstream      → 走自建 Hermes 网关，带 vendor 前缀（deepseek/…）
 *      · deepseekOfficialModel() → 走 api.deepseek.com，官方真名，无前缀
 *
 * 实测结果（2026-10 直接请求 https://api.deepseek.com/models 得到）：
 *     官方当前只暴露两个模型：deepseek-v4-pro、deepseek-flash
 *
 * 并且发现一个隐蔽陷阱 —— 旧名【不报错，而是静默回落】：
 *     deepseek-chat      → 200，实际 model = deepseek-flash
 *     deepseek-reasoner  → 200，实际 model = deepseek-flash
 *     deepseek-v4-flash  → 200，实际 model = deepseek-flash（连这个都回落）
 * 也就是说，继续用旧名不会看到任何报错，只会在账单和效果上悄悄降级。
 * 因此这里直接用官方真名，杜绝"以为在跑 Pro、其实跑 Flash"的情况。
 * ========================================================================= */

/** 官方 API 的默认（旗舰）模型 */
export function deepseekOfficialModel(): string {
  return env('DEEPSEEK_CHAT_MODEL', env('DS_OFFICIAL_MODEL', 'deepseek-v4-pro'));
}

/** 官方 API 的高效模型（这是官方真名，不是 deepseek-v4-flash） */
export function deepseekOfficialFlashModel(): string {
  return env('DS_OFFICIAL_FLASH_MODEL', 'deepseek-flash');
}
