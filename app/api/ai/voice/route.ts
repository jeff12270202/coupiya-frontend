import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { command, type } = await req.json();

    // Mock 语音命令响应
    let response = '';
    if (command.includes('搜索') || command.includes('找')) {
      response = '好的！我正在为你搜索相关陶瓷饰品，请稍候...';
    } else if (command.includes('订单') || command.includes('购买')) {
      response = '让我为你查询订单状态...';
    } else if (command.includes('推荐') || command.includes('好看')) {
      response = '根据你的喜好，我为你推荐几款热门陶瓷饰品！';
    } else {
      response = `收到你的指令："${command}"，我会尽力帮助你！`;
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
