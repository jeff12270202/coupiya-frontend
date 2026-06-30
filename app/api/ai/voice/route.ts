import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { command, type: _type } = await req.json();
    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    let response = '';

    // 1. 如果有 DeepSeek Key，尝试调用 AI 进行真实的语音指令理解
    if (deepseekKey) {
      try {
        const aiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
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
                content: `你是一个电商平台的 AI 语音助手。用户发送了一段语音指令，请分析他的意图并给出友好、有用的回复。尽量保持回复简短（20字以内，像语音助手一样）。回复必须是中文。`
              },
              {
                role: 'user',
                content: `用户指令：${command}`
              }
            ],
            max_tokens: 100,
            temperature: 0.5,
          }),
        });

        if (aiResponse.ok) {
          const data = await aiResponse.json();
          const aiReply = data.choices?.[0]?.message?.content?.trim();
          if (aiReply) {
            response = aiReply;
          }
        }
      } catch (deepseekError) {
        console.warn('DeepSeek Voice fell back due to:', deepseekError);
        // 如果 AI 失败，进入下面的 Mock 兜底
      }
    }

    // 2. 兜底方案：如果没配 Key 或 AI 调用失败，回落原有的关键词匹配逻辑
    if (!response) {
      if (command.includes('搜索') || command.includes('找')) {
        response = '好的！我正在为你搜索相关陶瓷饰品，请稍候...';
      } else if (command.includes('订单') || command.includes('购买') || command.includes('物流')) {
        response = '让我为你查询订单状态...';
      } else if (command.includes('推荐') || command.includes('好看') || command.includes('特色')) {
        response = '根据你的喜好，我为你推荐几款热门陶瓷饰品！';
      } else {
        response = `收到你的指令："${command}"，我会尽力帮助你！`;
      }
    }

    return NextResponse.json({
      reply: response,
      success: true
    });
  } catch (error) {
    console.error('Voice API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    );
  }
}