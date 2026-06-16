import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();

    // Mock 响应 - 实际项目应替换为真实 AI API
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
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    );
  }
}
