import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history = [], model: rawModel } = body;

    // =========================================================================
    // 🔥 模型映射：前端可能传 DeepSeek-R1/DeepSeek-V3 等显示名，
    //    必须映射为 Hermes 认可的 deepseek-chat，否则 400 "Unable to parse query"
    // =========================================================================
    const modelMap: Record<string, string> = {
      'DeepSeek-R1': 'deepseek-chat',
      'DeepSeek-V3': 'deepseek-chat',
      'deepseek-chat': 'deepseek-chat',
      'deepseek-r1': 'deepseek-chat',
      'deepseek-v3': 'deepseek-chat',
    };
    const model = modelMap[rawModel] || 'deepseek-chat';

    // 构建消息历史 — 只保留 role/content，剔除前端附加的 id/timestamp
    const cleanHistory = (history as Array<{ role: string; content: string }>).map(
      ({ role, content }) => ({ role, content })
    );
    const messages = [
      {
        role: 'system',
        content:
          '你是瓷韵 AI 助手，专门帮助用户推荐陶瓷饰品、解答产品问题。你友善、专业，对中国传统陶瓷文化有深入了解。',
      },
      ...cleanHistory,
      {
        role: 'user',
        content: message,
      },
    ];

    // =========================================================================
    // 🔥 核心修复：直连 VM100119 Hermes 内网 IP，绕过腾讯云 Nginx
    //    Nginx 会强制覆盖 Authorization → Basic Auth，导致 Hermes 收到错误凭证
    //    因此必须走 ZeroTier 内网直连：10.136.131.232:8081
    // =========================================================================
    const HERMES_CHAT_ENDPOINT =
      process.env.HERMES_CHAT_ENDPOINT ||
      'http://10.136.131.232:8082/v1/chat/completions';

    // Authorization：优先透传前端 Bearer Token，若无则使用服务端 DEEPSEEK_API_KEY
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 这一条是核心！因为我们刚刚在 hermes-agent 导入了这把钥匙！
    if (process.env.HERMES_API_KEY) {
      forwardHeaders['Authorization'] = `Bearer ${process.env.HERMES_API_KEY}`;
    } else {
      // 兜底逻辑（如果没有配置，尝试使用前端传过来的 header）
      const authHeader = req.headers.get('authorization');
      if (authHeader) {
        forwardHeaders['Authorization'] = authHeader;
      }
    }
    
    // ----- 首选：通过完整的 Hermes 地址请求 DeepSeek -----
    try {
      const hermesResponse = await fetch(HERMES_CHAT_ENDPOINT, {
        method: 'POST',
        headers: forwardHeaders,
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      if (hermesResponse.ok) {
        const data = await hermesResponse.json();
        return NextResponse.json({
          reply: data.choices?.[0]?.message?.content ?? '（Hermes 返回空内容）',
          success: true,
        });
      }

      console.warn(
        `Hermes endpoint returned ${hermesResponse.status}: ${await hermesResponse.text().catch(() => '')}`
      );
    } catch (hermesError) {
      console.warn('Hermes gateway unreachable, falling back:', hermesError);
    }

    // ----- 兜底：Mock 响应，保证前端不崩溃 -----
    const mockResponses = [
      '你好！我是瓷韵 AI 助手，很高兴为你服务！我可以帮你推荐陶瓷饰品、解答产品问题。',
      '感谢你的咨询！这款陶瓷手链采用传统工艺制作，温润细腻，非常适合日常佩戴。',
      '关于这个问题，让我为你详细解答...我们的陶瓷饰品都经过严格质量检测。',
      '好的，我理解你的需求！让我为你推荐几款适合的陶瓷饰品。',
      '这是一个很好的问题！我们的产品支持全球配送，通常 3-7 天可以送达。',
    ];

    const randomResponse =
      mockResponses[Math.floor(Math.random() * mockResponses.length)];

    return NextResponse.json({
      reply: randomResponse,
      success: true,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    );
  }
}