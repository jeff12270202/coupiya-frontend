import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, style, width = 512, height = 512 } = body;
  const replicateToken = process.env.REPLICATE_API_TOKEN;

  if (!replicateToken) {
    // Fallback to placeholder when no token
    const imageUrl = `https://placehold.co/${width}x${height}/f472b6/white?text=${encodeURIComponent(prompt?.slice(0, 20) || 'AI Image')}`;
    return NextResponse.json({ imageUrl, success: true });
  }

  try {
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${replicateToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: "stability-ai/stable-diffusion:db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf",
        input: { prompt, negative_prompt: "ugly, blurry", width, height },
      }),
    });

    const data = await response.json();
    // 轮询获取结果（简化版，实际需要 async polling）
    if (data.urls && data.urls.get) {
      let result;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const pollRes = await fetch(data.urls.get, { headers: { 'Authorization': `Token ${replicateToken}` } });
        const pollData = await pollRes.json();
        if (pollData.status === 'succeeded') {
          result = pollData.output;
          break;
        }
      }
      if (result) return NextResponse.json({ imageUrl: Array.isArray(result) ? result[0] : result, success: true });
    }
    // Fallback
    const imageUrl = `https://placehold.co/${width}x${height}/f472b6/white?text=${encodeURIComponent(prompt?.slice(0, 20) || 'AI Image')}`;
    return NextResponse.json({ imageUrl, success: true });
  } catch (error) {
    console.error('Image generation error:', error);
    const imageUrl = `https://placehold.co/${width}x${height}/f472b6/white?text=${encodeURIComponent(prompt?.slice(0, 20) || 'AI Image')}`;
    return NextResponse.json({ imageUrl, success: true });
  }
}