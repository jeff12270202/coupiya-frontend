// ============================================================================
// lib/site-tools.ts —— Agent 工具注册表（AI 能对本站做的全部真实操作）
// ----------------------------------------------------------------------------
// 设计原则（决定了这个助手是"真能干"还是"看起来能干"）：
//
//   1. 【每一个工具都必须有真实落点】
//      要么指向仓库里存在的 API 路由，要么指向前端确实能执行的浏览器动作。
//      改版前的反例：/api/ai/chat 声明了 search_product 工具，前端却从未实现
//      执行分支 —— 模型调用它，用户什么也得不到。这种"死工具"比没有更糟：
//      它会让模型以为自己有搜索能力，从而编造商品。
//
//   2. 【执行位置显式声明】
//      server：由 /api/ai/site-tools 在服务端执行（可访问数据库、上游 API）
//      client：由浮窗在浏览器里执行（跳转、滚动、开窗、触发行人脸核身）
//      模型不需要知道区别；前端路由工具调用时需要。
//
//   3. 【描述写给模型看，不是写给人看】
//      whenToUse 直接进 tool.description，是模型决定"要不要调、参数填什么"的
//      唯一依据。写含糊了，模型就会乱调或漏调。
// ============================================================================

export type ToolExecutor = 'server' | 'client';

export interface SiteTool {
  name: string;
  executor: ToolExecutor;
  /** 中文名，用于前端展示"正在执行：搜索商品" */
  label: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export const SITE_TOOLS: ReadonlyArray<SiteTool> = [
  /* ======================= 服务端工具 ======================= */
  {
    name: 'site_search',
    executor: 'server',
    label: '检索全站服务',
    description:
      '检索本网站向全球提供的全部服务、页面与 AI 能力。当用户问"你们能做什么"、"有没有 XX 功能"、"怎么 XX"、' +
      '或任何你不确定本站是否支持的事情时，【必须先调用这个工具】，绝不要凭印象回答。' +
      '返回每条服务的能力说明、可执行动作与对应页面路径。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索词，用用户的原话即可，例如"卫星云盘"、"能不能翻译"、"充值"' },
        limit: { type: 'number', description: '返回条数，默认 6，最多 20' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_product',
    executor: 'server',
    label: '搜索商品',
    description:
      '在站内电商系统中按关键词搜索真实在售的陶瓷饰品，返回商品名、价格与详情页链接。' +
      '用户问"有没有…"、"多少钱"、想找某类商品时必须调用；不要在没查的情况下描述商品。',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '商品关键词，例如"青花瓷手串"、"茶具"、"耳环"' },
        first: { type: 'number', description: '返回条数，默认 5，最多 12' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'search_blog',
    executor: 'server',
    label: '搜索灵感日志',
    description:
      '在站内博客（灵感日志）中搜索文章，返回标题、摘要与链接。用户想读文章、找灵感、了解品牌故事时调用。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索词，例如"青花"、"匠人"、"AI 创作"' },
        per_page: { type: 'number', description: '返回条数，默认 5，最多 10' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_my_account',
    executor: 'server',
    label: '查询我的账户',
    description:
      '查询【当前登录用户】的 Credits 余额与最近消费/充值明细。用户问"我还有多少钱"、' +
      '"我的消费记录"、"为什么扣费"时调用。未登录会返回未登录状态 —— 此时应引导用户刷脸登录，不要编造余额。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'translate_text',
    executor: 'server',
    label: '翻译',
    description:
      '把文本翻译成目标语言。用户给出外文要求翻译、或要求把内容译成某语言时直接调用，拿到结果再回复，不要自己"心译"。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要翻译的原文' },
        target_lang: { type: 'string', description: '目标语言，中文写"中文"、"英文"、"日文"等，默认英文' },
        source_lang: { type: 'string', description: '源语言，不确定可省略，自动检测' },
      },
      required: ['text'],
    },
  },
  {
    name: 'web_search',
    executor: 'server',
    label: '联网搜索',
    description:
      '联网检索站外实时信息（新闻、价格、法规、技术文档）。问题涉及最新信息时调用；站内信息请用 site_search，不要用这个。',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: '搜索关键词' } },
      required: ['query'],
    },
  },

  /* ======================= 客户端工具 ======================= */
  {
    name: 'navigate',
    executor: 'client',
    label: '打开页面',
    description:
      '让用户的浏览器跳转到站内某个页面。path 必须来自 site_search 返回的真实路径，' +
      '绝不要自己拼路径。用户说"带我去"、"打开"、"我想看看"时调用。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '站内路径，例如 /satellite、/recharge、/product/xxx' },
        reason: { type: 'string', description: '为什么带用户去这里，会显示给用户看' },
      },
      required: ['path'],
    },
  },
  {
    name: 'open_harness',
    executor: 'client',
    label: '打开 Harness 主梁',
    description:
      '打开 Harness 运行时主梁工作台（独立窗口），用于工程图纸解读、复杂代码生成、系统架构设计等分钟级高精尖任务。' +
      '当用户的诉求超出普通对话能力（需要多步工具链、代码沙箱、图纸解析）时调用。',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string', description: '为什么建议走主梁，会显示给用户' } },
      required: [],
    },
  },
  {
    name: 'scroll_to_section',
    executor: 'client',
    label: '定位到页面板块',
    description:
      '把当前页面滚动到指定板块。目前仅星链接入口（/satellite）支持：' +
      'detect=手机直连检测、hardware=硬件终端、ai-sms=短信驱动AI、expert=专家工单、drive=卫星云盘、compliance=合规公示。' +
      '用户已在 /satellite 上问某个板块时调用，避免让用户自己找。',
    parameters: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description: '板块 id',
          enum: ['detect', 'hardware', 'ai-sms', 'expert', 'drive', 'compliance'],
        },
      },
      required: ['section'],
    },
  },
  {
    name: 'open_face_login',
    executor: 'client',
    label: '发起刷脸登录',
    description:
      '为用户打开刷脸登录弹窗（人脸核身，3-5 秒）。当用户要做需要登录的操作（充值、开通云盘、查看账户）' +
      '但尚未登录时调用。未登录时不要假装能查到账户数据。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

/** 供上游 LLM 的 tools 参数使用（OpenAI 兼容格式，剔除内部字段） */
export function toolSchemasForUpstream() {
  return SITE_TOOLS.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export function findTool(name: string): SiteTool | undefined {
  return SITE_TOOLS.find((t) => t.name === name);
}

export function toolLabel(name: string): string {
  return findTool(name)?.label ?? name;
}
