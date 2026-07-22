import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      message,
      history = [],
      model: rawModel,
      attachments = [], // 多模态附件
    } = body;

    // =========================================================================
    // 1. 模型映射：为了保证 Hermes 不 404，前端传什么我们都映射给 deepseek-r1
    // =========================================================================
    const modelMap: Record<string, string> = {
      'DeepSeek-R1': 'deepseek/deepseek-r1',
      'DeepSeek-V3': 'deepseek/deepseek-r1',
      'deepseek-r1': 'deepseek/deepseek-r1',
      'deepseek-v3': 'deepseek/deepseek-r1',
    };
    const model = modelMap[rawModel] || 'deepseek/deepseek-r1';

    // =========================================================================
    // 2. 【核心升级一】图片预处理：调用 MiniMax-VL 模型"看图说话"
    //    彻底废除 HuggingFace 代理，只需使用你现有的 MINIMAX_API_KEY！
    // =========================================================================
    let imageDescription = '';
    let hasImage = false;
    if (attachments && Array.isArray(attachments)) {
      const imageAtt = attachments.find((a: any) => a.type === 'image' && a.base64);
      if (imageAtt) {
        hasImage = true;
        try {
          // 调用 MiniMax 官方视觉模型接口（无 Nginx 代理依赖）
          const miniMaxRes = await fetch('https://api.minimax.io/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.MINIMAX_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'MiniMax-VL', // MiniMax 的通用视觉模型
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: '请用一句话简要描述这张图片的内容，以便我可以向另一个AI系统传达它的关键信息。',
                    },
                    {
                      type: 'image_url',
                      image_url: { url: imageAtt.base64 },
                    },
                  ],
                },
              ],
            }),
          });
          if (miniMaxRes.ok) {
            const miniMaxData = await miniMaxRes.json();
            imageDescription =
              miniMaxData.choices?.[0]?.message?.content || '（MiniMax未能生成描述）';
          }
        } catch (e) {
          console.error('MiniMax 图像分析服务异常:', e);
          imageDescription = '（图像分析接口暂时不可用）';
        }
      }
    }

    // =========================================================================
    // 3. 文档附件处理 (RAG 注入)
    // =========================================================================
    let documentContext = '';
    if (attachments && Array.isArray(attachments)) {
      const docs = attachments.filter((a: any) => a.type === 'document' && a.text);
      if (docs.length > 0) {
        documentContext =
          '\n\n--- 用户上传的文档内容（请基于此内容回答问题）---\n' +
          docs.map((d: any, i: number) => `[文档${i + 1}: ${d.fileName}]\n${d.text}`).join('\n\n') +
          '\n--- 文档内容结束 ---';
      }
    }

    // =========================================================================
    // 4. 构建系统提示词（把 MiniMax 生成的描述塞进去，DeepSeek 就能"看懂"图片了）
    // =========================================================================
    const visualAnalysis = hasImage ? `\n\n[AI 图片分析结果]: ${imageDescription}` : '';
    const systemContent =
      '你是瓷韵 AI 智能体助手，专门帮助用户推荐陶瓷饰品、解答产品问题、提供文化建议，并具备调用外部工具来获取实时信息的能力。' +
      visualAnalysis +
      documentContext;

    // 构建消息历史并剔除无用字段
    const cleanHistory = (history as Array<{ role: string; content: string }>).map(
      ({ role, content }) => ({ role, content })
    );

    // 用户消息内容
    const userContentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    userContentParts.push({ type: 'text', text: message || '请分析以下内容' });
    const userMessageContent =
      userContentParts.length === 1 && userContentParts[0]?.type === 'text'
        ? userContentParts[0].text
        : userContentParts;

    const messages = [
      { role: 'system', content: systemContent },
      ...cleanHistory,
      { role: 'user', content: userMessageContent },
    ];

    // =========================================================================
    // 5. 【核心升级二】添加智能体工具调用 — 联网搜索 + 商业自动化
    // =========================================================================
    const tools = [
      {
        type: 'function',
        function: {
          name: 'web_search',
          description: '联网搜索实时信息，当用户询问的问题需要最新资讯、新闻、实时数据时调用此工具',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '搜索关键词，例如：2024年最流行的陶瓷饰品趋势' },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_product',
          description: '在电商系统中搜索相关的陶瓷饰品，返回商品名称、价格、库存等信息',
          parameters: {
            type: 'object',
            properties: {
              keyword: { type: 'string', description: '搜索关键词，例如：青花瓷手串' },
            },
            required: ['keyword'],
          },
        },
      },
    ];

    const requestBody: any = {
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4000,
      tools: tools,
      tool_choice: 'auto',
    };

    // =========================================================================
    // 6. 发送给 Hermes 内网 IP (端口 8082) —— 增加 30 秒超时保护
    // =========================================================================
    const HERMES_CHAT_ENDPOINT =
      process.env.HERMES_CHAT_ENDPOINT ||
      'http://10.136.131.232:8082/v1/chat/completions';

    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (process.env.HERMES_API_KEY) {
      forwardHeaders['Authorization'] = `Bearer ${process.env.HERMES_API_KEY}`;
    } else {
      const authHeader = req.headers.get('authorization');
      if (authHeader) forwardHeaders['Authorization'] = authHeader;
    }

    // ★ 30 秒超时保护：防止 ZeroTier 网络延迟过大导致 fetch 永久挂起 ★
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

    const hermesResponse = await fetch(HERMES_CHAT_ENDPOINT, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!hermesResponse.ok) {
      const errorText = await hermesResponse.text().catch(() => '未知错误');
      return NextResponse.json(
        { error: `Hermes API Error [${hermesResponse.status}]`, details: errorText, success: false },
        { status: hermesResponse.status }
      );
    }

    const data = await hermesResponse.json();
    const choice = data.choices?.[0]?.message;

    // =========================================================================
    // 7. 【核心升级三】拦截 tool_calls 并原样返回给前端处理
    // =========================================================================
    if (choice?.tool_calls && choice.tool_calls.length > 0) {
      return NextResponse.json({
        tool_calls: choice.tool_calls,
        role: choice.role || 'assistant',
        success: true,
        is_tool_call: true, // 前端识别这个标记，去执行 API 查询
      });
    }

    const reply = choice?.content?.trim() || '（Hermes 返回了空的思考结果）';
    return NextResponse.json({ reply, success: true });

  } catch (error: any) {
    console.error('Chat API 无法连接到 Hermes:', error);
    return NextResponse.json(
      { error: 'Hermes 代理服务连接异常', details: error.message, success: false },
      { status: 500 }
    );
  }
}
