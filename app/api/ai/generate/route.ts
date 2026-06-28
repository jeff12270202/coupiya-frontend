import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, width = 512, height = 512 } = body;

    // Mock 图像生成响应 - 使用 placeholder
    const imageUrl = `https://placehold.co/${width}x${height}/f472b6/white?text=${encodeURIComponent(prompt.slice(0, 20))}`;

    return NextResponse.json({
      imageUrl,
      success: true
    });
  } catch (error) {
    console.error('Generate API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    );
  }
}
