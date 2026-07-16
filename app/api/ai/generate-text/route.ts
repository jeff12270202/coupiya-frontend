import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    // 如果没有配置 DeepSeek Key，直接返回假数据
    if (!deepseekKey) {
      return NextResponse.json({ 
        text: `[模拟文本] 您正在使用瓷韵 AI 助手进行文本创作，输入提示词为：${prompt}`,
        success: true
      });
    }

    // 调用 DeepSeek 官方 API
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deepseekKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的中国传统文化与陶瓷艺术文案创作助手。请根据用户的提示，生成优美、有吸引力且富有文化底蕴的文本（可以是营销文案、产品介绍、诗歌或短文）。直接输出创作结果，不要输出多余解释。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 800,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      throw new Error('DeepSeek API 调用失败');
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '无响应';

    return NextResponse.json({ text, success: true });

  } catch (error) {
    console.error('Text generation error:', error);
    return NextResponse.json(
      { error: '生成文本失败', success: false },
      { status: 500 }
    );
  }
}