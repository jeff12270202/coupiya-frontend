import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, width = 512, height = 512 } = body;
  const minimaxApiKey = process.env.MINIMAX_API_KEY;

  // 如果没有 API Key，返回模拟数据
  if (!minimaxApiKey) {
    const imageUrl = `https://placehold.co/${width}x${height}/f472b6/white?text=${encodeURIComponent(prompt?.slice(0, 20) || 'AI Image')}`;
    return NextResponse.json({ imageUrl, success: true });
  }

  try {
    // 调用 MINIMAX 文生图 API
    const response = await fetch('https://api.minimax.chat/v1/image_generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${minimaxApiKey}`,
      },
      body: JSON.stringify({
        model: 'image-01',
        prompt: prompt || '一幅美丽的陶瓷饰品图片',
        width: Math.min(1024, Math.max(512, width)),
        height: Math.min(1024, Math.max(512, height)),
        n: 1,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.data && data.data[0] && data.data[0].url) {
        return NextResponse.json({
          imageUrl: data.data[0].url,
          success: true,
        });
      }
    }
  } catch (error) {
    console.error('MINIMAX API error:', error);
  }

  // 如果失败，返回模拟数据
  const imageUrl = `https://placehold.co/${width}x${height}/f472b6/white?text=${encodeURIComponent(prompt?.slice(0, 20) || 'AI Image')}`;
  return NextResponse.json({ imageUrl, success: true });
}