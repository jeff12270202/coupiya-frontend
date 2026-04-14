import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();
  const replicateToken = process.env.REPLICATE_API_TOKEN;

  if (!replicateToken) {
    return NextResponse.json({ error: 'Missing REPLICATE_API_TOKEN' }, { status: 500 });
  }

  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${replicateToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: "stability-ai/stable-diffusion:db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf",
      input: { prompt, negative_prompt: "ugly, blurry", width: 768, height: 768 },
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
    if (result) return NextResponse.json({ imageUrl: Array.isArray(result) ? result[0] : result });
  }
  return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
}