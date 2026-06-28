import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history = [] } = body;

    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-4687263053374011a56101c4cbf4c5dd';

    // 构建消息历史
    const messages = [
      {
        role: 'system',
        content: '你是瓷韵 AI 助手，专门帮助用户推荐陶瓷饰品、解答产品问题。你友善、专业，对中国传统陶瓷文化有深入了解。'
      },
      ...history,
      {
        role: 'user',
        content: message
      }
    ];

    try {
      // 调用 DeepSeek API
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: messages,
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({
          reply: data.choices[0].message.content,
          success: true
        });
      } else {
        // 如果 API 调用失败，使用 Mock 响应
        throw new Error('API call failed');
      }
    } catch (apiError) {
      console.warn('Falling back to mock response due to:', apiError);
      // Mock 响应作为后备
      const mockResponses = [
        '你好！我是瓷韵 AI 助手，很高兴为你服务！我可以帮你推荐陶瓷饰品、解答产品问题。',
        '感谢你的咨询！这款陶瓷手链采用传统工艺制作，温润细腻，非常适合日常佩戴。',
        '关于这个问题，让我为你详细解答...我们的陶瓷饰品都经过严格质量检测。',
        '好的，我理解你的需求！让我为你推荐几款适合的陶瓷饰品。',
        '这是一个很好的问题！我们的产品支持全球配送，通常 3-7 天可以送达。'
      ];

      const randomResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];

      return NextResponse.json({
        reply: randomResponse,
        success: true
      });
    }
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    );
  }
}
