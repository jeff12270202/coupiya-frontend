// ============================================================================
// lib/site-catalog.ts —— 全站服务目录（AI 助手检索本网站的【唯一事实来源】）
// ----------------------------------------------------------------------------
// 为什么需要它：
//   改版前助手对自己的网站一无所知 —— 用户问"你们能做什么"，它只能编。
//   真正的"能操作全站"必须先让 AI【知道】全站有什么，而且知道的必须是真实存在的
//   东西。所以这份目录里每一条都对应仓库里真实存在的路由或 API，
//   没有一条是"设想中的功能"。
//
// 维护规则（很重要）：
//   · 新增页面/接口时，同步在这里加一条；遗漏只会让 AI "不知道"，不会让它说错。
//   · summary / whenToUse 是写给模型看的提示词，要具体、可判断。
//   · actions 是 AI 可以【替用户执行】的标准动作名，必须与 lib/site-tools.ts
//     里的工具名或前端可执行动作一致 —— 否则 AI 会承诺做不到的事。
// ============================================================================

export type ServiceKind = 'page' | 'commerce' | 'content' | 'ai' | 'account' | 'satellite' | 'runtime';

export interface SiteService {
  id: string;
  /** 用户能听懂的名字 */
  name: string;
  kind: ServiceKind;
  /** 前端路由（可被 navigate 工具直达） */
  path?: string;
  /** 后端接口 */
  api?: string;
  /** 一句话说明这是什么 */
  summary: string;
  /** 检索关键词（中英混排，覆盖用户可能的说法） */
  keywords: string[];
  /** AI 可替用户执行的标准动作 */
  actions: string[];
  /** 是否需要登录 */
  requiresAuth?: boolean;
  /** 写给模型的判断依据：什么情况下该用/该推荐这个 */
  whenToUse: string;
}

export const SITE_SERVICES: ReadonlyArray<SiteService> = [
  /* ---------------------------- 页面与入口 ---------------------------- */
  {
    id: 'home',
    name: '首页 · 瓷韵灵境',
    kind: 'page',
    path: '/',
    summary: 'AI 赋能的陶瓷饰品商店首页，展示品牌主张与主要功能入口。',
    keywords: ['首页', '主页', 'home', '瓷韵', '灵境', '品牌'],
    actions: ['navigate'],
    whenToUse: '用户想回首页、或问"网站是做什么的"时，先介绍这里。',
  },
  {
    id: 'satellite',
    name: '星链接入口',
    kind: 'satellite',
    path: '/satellite',
    summary:
      '卫星互联网 + AI 的综合入口：手机卫星直连机型检测、硬件终端导流、短信驱动 AI（无网环境发指令）、专家转包工单、个人卫星云盘（Backblaze B2）。',
    keywords: ['星链', 'starlink', '卫星', '天通', '北斗', '直连', '检测', '硬件', '云盘', '无网', '应急', 'satellite'],
    actions: ['navigate', 'scroll_to_section', 'open_harness'],
    whenToUse: '用户提到卫星、星链、无网环境、离线办公、应急通信、卫星云盘时，引导到这里。',
  },
  {
    id: 'harness',
    name: 'Harness 运行时主梁工作台',
    kind: 'runtime',
    path: '/harness',
    summary:
      'Harness 是位于大模型之上的运行时层，按 Serverless 形态部署（任务到达拉起实例、跑完销毁）。用于工程图纸解读、复杂代码生成、系统架构设计等分钟级高精尖任务，带执行轨迹与 20 个插件的真实落地状态。',
    keywords: ['harness', '主梁', 'agent', '智能体', '工程图纸', '图纸', 'cad', 'dwgf', '复杂代码', '架构', '高精尖', '轨迹', '插件'],
    actions: ['navigate', 'open_harness'],
    whenToUse:
      '任务需要多步工具链、代码沙箱或图纸解析时（例如"帮我看这张图纸"、"写一个完整项目"），推荐走 Harness 主梁，并可直接打开跳窗。',
  },
  {
    id: 'ai-wordpress',
    name: 'AI-WORDPRESS 创作工坊',
    kind: 'ai',
    path: '/ai-wordpress',
    summary: '一站式 AI 内容创作：纹样创生、全球集展翻译、语音寻瓷、AR 试戴。',
    keywords: ['创作', '工坊', 'wordpress', '纹样', '翻译', '语音', 'AR', '试戴', '内容生成'],
    actions: ['navigate'],
    whenToUse: '用户想生成内容、做设计、翻译、或体验 AR 试戴时。',
  },
  {
    id: 'blog',
    name: '灵感日志（博客）',
    kind: 'content',
    path: '/blog',
    api: '/api/ai/search-blog',
    summary: '网站官方博客，发布陶瓷艺术、AI 创作与行业资讯文章。',
    keywords: ['博客', 'blog', '灵感日志', '文章', '资讯', '新闻', '阅读'],
    actions: ['navigate', 'search_blog'],
    whenToUse: '用户想读文章、找灵感、了解品牌故事时；可以先用 search_blog 检索再给出链接。',
  },
  {
    id: 'login',
    name: '刷脸登录 / 注册',
    kind: 'account',
    path: '/login',
    api: '/api/auth/face/start',
    summary: '人脸核身登录，3-5 秒完成，无需记密码；也支持设置密码后用账号密码登录。',
    keywords: ['登录', '注册', '刷脸', '人脸', 'face', 'signin', 'signup', '账号'],
    actions: ['open_face_login', 'navigate'],
    requiresAuth: false,
    whenToUse: '用户未登录却想下单、开通云盘、查看账户时，主动引导刷脸登录。',
  },
  {
    id: 'account',
    name: '我的账户',
    kind: 'account',
    path: '/account',
    api: '/api/account/transactions',
    summary: '查看 Credits 余额、充值记录、消费明细与个人信息。',
    keywords: ['账户', '我的', '余额', '明细', '账单', '消费', 'account', 'credits', '积分'],
    actions: ['navigate', 'get_my_account'],
    requiresAuth: true,
    whenToUse: '用户问"我还有多少钱"、"我的消费记录"时，先用 get_my_account 查真实数据再回答。',
  },
  {
    id: 'recharge',
    name: '充值 Credits',
    kind: 'account',
    path: '/recharge',
    api: '/api/paypal/create-order',
    summary: '通过 PayPal（沙箱已通）为自己的账户充值 Credits，用于 AI 生成等消耗。',
    keywords: ['充值', '付款', '支付', 'paypal', '买 credits', '余额不足', 'recharge', 'topup'],
    actions: ['navigate'],
    requiresAuth: true,
    whenToUse: '用户余额不足、或明确说想充值时，给 /recharge 链接。',
  },

  /* ------------------------------ 电商 ------------------------------ */
  {
    id: 'product',
    name: '商品详情与选购',
    kind: 'commerce',
    path: '/product/[id]',
    api: '/api/ai/site-tools (search_product)',
    summary: '陶瓷饰品商品详情：价格、图文、加购与下单。',
    keywords: ['商品', '产品', '购买', '下单', '价格', '多少钱', '加购', '购物车', 'product', 'buy', 'cart'],
    actions: ['search_product', 'navigate'],
    whenToUse: '用户问"有没有…"、"多少钱"、想找某类饰品时，先用 search_product 搜真实商品，再给链接。',
  },
  {
    id: 'movie',
    name: '影片播放与详情',
    kind: 'content',
    path: '/movie/[slug]',
    api: '/api/pexels/videos',
    summary: '站内影片详情页与播放器（video.js），支持 AI 生成的 UGC 影片。',
    keywords: ['影片', '电影', '视频', 'movie', '观看', '播放', '播放器'],
    actions: ['navigate'],
    whenToUse: '用户想看片、问某部影片时。',
  },

  /* ------------------------------ AI 能力 ------------------------------ */
  {
    id: 'ai-chat',
    name: 'AI 对话（本助手）',
    kind: 'ai',
    api: '/api/ai/chat',
    summary: '就是当前这个对话窗口：支持看图、读文档、联网搜索、查站内服务并直接操作页面。',
    keywords: ['对话', '聊天', '助手', 'chat', 'ai', '问答'],
    actions: [],
    whenToUse: '用户在和你的每一次对话里，都隐含在使用这个能力。',
  },
  {
    id: 'ai-text',
    name: 'AI 文本生成',
    kind: 'ai',
    api: '/api/ai/generate-text',
    summary: '长文本生成（文案、大纲、说明文），走 DeepSeek 官方 API。',
    keywords: ['写文案', '生成文本', '大纲', '写作', 'generate text', '文案'],
    actions: ['generate_text'],
    whenToUse: '用户要一篇成篇的文字产出时。',
  },
  {
    id: 'ai-image',
    name: 'AI 图片生成',
    kind: 'ai',
    api: '/api/ai/generate-image',
    summary: '文生图 / 图生图（Polinations 等引擎），可产出陶瓷纹样与商品概念图。',
    keywords: ['画图', '生成图片', '文生图', '图片', 'image', '纹样', '出图', '海报'],
    actions: ['navigate'],
    whenToUse: '用户想要一张图时，引导到创作工坊或说明能力边界。',
  },
  {
    id: 'ai-video',
    name: 'AI 视频生成',
    kind: 'ai',
    api: '/api/ai/generate-video',
    summary: '文生视频 / 图生视频，生成后可发布为站内影片。',
    keywords: ['生成视频', '文生视频', '视频生成', 'video', '短片', '动画'],
    actions: ['navigate'],
    whenToUse: '用户想生成视频时。',
  },
  {
    id: 'ai-translate',
    name: '多语言翻译',
    kind: 'ai',
    api: '/api/ai/translate',
    summary: '50+ 语言互译，用于跨境电商场景与多语言客服。',
    keywords: ['翻译', 'translate', '英文', '多语言', '外语', '译成'],
    actions: ['translate_text'],
    whenToUse: '用户给出外文、或要求把内容翻译成某语言时，直接调用 translate_text 给出结果。',
  },
  {
    id: 'ai-tts',
    name: '语音合成（TTS）',
    kind: 'ai',
    api: '/api/ai/text-to-speech',
    summary: '把文字转成语音。',
    keywords: ['语音合成', 'tts', '配音', '朗读', '念出来', '转语音'],
    actions: ['navigate'],
    whenToUse: '用户要求把文字读出来/配音时。',
  },
  {
    id: 'ai-voice',
    name: '语音识别（ASR）',
    kind: 'ai',
    api: '/api/ai/voice',
    summary: '把语音转成文字，浮窗左下角麦克风按钮即此能力。',
    keywords: ['语音识别', 'asr', '听写', '转文字', '说话输入'],
    actions: [],
    whenToUse: '用户想用说话代替打字时，提示点浮窗里的麦克风。',
  },
  {
    id: 'web-search',
    name: '联网搜索',
    kind: 'ai',
    api: '/api/ai/web-search',
    summary: '实时联网检索（SERPAPI），用于最新资讯、价格、法规。',
    keywords: ['搜索', '联网', '查一下', '最新', '实时', '新闻', 'web search'],
    actions: ['web_search'],
    whenToUse: '问题涉及站外实时信息时，先 web_search 再回答，不要凭记忆编。',
  },

  /* ---------------------------- 卫星生态 ---------------------------- */
  {
    id: 'b2-drive',
    name: '我的卫星云盘（Backblaze B2）',
    kind: 'satellite',
    api: '/api/b2/objects',
    summary:
      '开通后自动获得专属私有桶 + 受限密钥；浏览器预签名直传不经服务器；上传后 3 天可下载、再 3 天由生命周期自动删除。',
    keywords: ['云盘', '网盘', '存储', '上传', '下载', 'b2', 'backblaze', '桶', '文件', '生命周期', '分享链接'],
    actions: ['navigate'],
    requiresAuth: true,
    whenToUse: '用户要存文件、要提取链接、问文件保留多久时。',
  },
  {
    id: 'satellite-expert',
    name: '专家转包与工单系统',
    kind: 'satellite',
    path: '/satellite#expert',
    summary:
      '高精尖任务的人工兜底通道：AI 出初稿 → 实名专家精修 → 成果回传。三色状态：红=需人工紧急、黄=AI 处理中、绿=已完成。',
    keywords: ['专家', '转包', '工单', '人工', '审核', '紧急'],
    actions: ['navigate', 'scroll_to_section'],
    whenToUse: 'AI 无法胜任、或用户要求人工介入时，给出工单入口并提醒带上工单号。',
  },

  /* ---------------------------- 计费与支付 ---------------------------- */
  {
    id: 'paypal',
    name: 'PayPal 支付',
    kind: 'commerce',
    api: '/api/paypal/create-order',
    summary: 'PayPal 沙箱与生产双通道下单 + 捕获 + Webhook 验签结算。',
    keywords: ['paypal', '支付', '付款', '外币', '信用卡'],
    actions: ['navigate'],
    whenToUse: '用户问海外如何付款时。',
  },
  {
    id: 'worldfirst',
    name: '万里汇 WorldFirst 收款',
    kind: 'commerce',
    api: '/api/payment/worldfirst/create-order',
    summary: '面向企业主体的跨境收款通道（企业入驻后启用）。',
    keywords: ['万里汇', 'worldfirst', '跨境收款', '企业付款'],
    actions: ['navigate'],
    whenToUse: '用户问企业大额收款的合规通道时。',
  },
];

/* ============================================================================
 * 检索
 * ========================================================================= */

export interface CatalogHit {
  service: SiteService;
  score: number;
  /** 命中原因，用于让 AI 向用户解释"为什么推荐这个" */
  matched: string[];
}

/**
 * 中英混排的朴素打分检索。
 *
 * 为什么不直接上向量检索：这份目录只有几十条，且条目本身就是为了被精确匹配
 * 而写的（keywords 覆盖了用户的各种口语说法）。朴素打分在本场景里延迟更低、
 * 结果可解释、且没有引入 embedding 依赖与额外成本。等目录规模上一个量级再换。
 */
export function searchCatalog(query: string, limit = 5): CatalogHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // 既按整串匹配，也按分词匹配（中文没有空格，所以同时做 n-gram 切片）
  const tokens = new Set<string>();
  for (const t of q.split(/[\s,，、。！？!?；;:：]+/).filter(Boolean)) tokens.add(t);
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= q.length; i++) tokens.add(q.slice(i, i + n));
  }

  const hits: CatalogHit[] = [];
  for (const svc of SITE_SERVICES) {
    let score = 0;
    const matched: string[] = [];

    // 名称命中权重最高
    if (svc.name.toLowerCase().includes(q)) {
      score += 100;
      matched.push(`名称完整命中「${svc.name}」`);
    }
    for (const kw of svc.keywords) {
      const k = kw.toLowerCase();
      if (q.includes(k)) {
        score += 40;
        matched.push(`关键词「${kw}」`);
      } else if (k.includes(q) && q.length >= 2) {
        score += 20;
        matched.push(`关键词近似「${kw}」`);
      }
    }
    // 摘要与用途的分词命中
    const hay = `${svc.summary} ${svc.whenToUse}`.toLowerCase();
    for (const t of tokens) {
      if (t.length < 2) continue;
      if (hay.includes(t)) score += 3;
    }

    if (score > 0) hits.push({ service: svc, score, matched: [...new Set(matched)].slice(0, 4) });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(limit, 20)));
}

/** 给模型看的紧凑目录摘要（控制 token：只给名字+用途+路径，不给全部关键词） */
export function catalogDigest(maxChars = 2600): string {
  const lines = SITE_SERVICES.map(
    (s) => `- ${s.name}${s.path ? `（${s.path}）` : ''}：${s.summary}`,
  );
  let out = '';
  for (const l of lines) {
    if (out.length + l.length + 1 > maxChars) break;
    out += `${l}\n`;
  }
  return out.trim();
}
