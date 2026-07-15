import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    const hfToken = process.env.HUGGINGFACE_API_KEY;

    if (!hfToken) {
      return NextResponse.json({
        imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologin=true`,
        success: false,
      });
    }

    const response = await fetch(
      'https://api-inference.huggingface.co/models/naclbit/trinart_stable_diffusion_v2',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: prompt }),
      }
    );

    if (!response.ok) {
      // fallback 到 Pollinations 图片
      const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologin=true`;
      return NextResponse.json({ imageUrl: fallbackUrl, success: false });
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return NextResponse.json({ imageUrl: `data:image/jpeg;base64,${base64}`, success: true });
  } catch (error) {
    console.error('Anime generation error:', error);
    return NextResponse.json(
      { error: 'Anime generation failed', success: false },
      { status: 500 }
    );
  }
}