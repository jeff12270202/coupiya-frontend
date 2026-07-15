import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    const hfToken = process.env.HUGGINGFACE_API_KEY;

    if (!hfToken) {
      throw new Error('Hugging Face API key missing');
    }

    const response = await fetch(
      'https://api-inference.huggingface.co/models/stabilityai/stable-video-diffusion',
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
      // 若频率受限，返回你 Nginx 上配置的占位视频
      return NextResponse.json({
        videoUrl: 'https://media.coupiya.com/placeholder-video.mp4',
        success: false,
        message: '使用占位视频（Hugging Face 限制或失败）',
      });
    }

    const blob = await response.blob();
    // Vercel 环境下，将生成的视频 blob 转为 base64 供前端预览
    const buffer = await blob.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const videoUrl = `data:video/mp4;base64,${base64}`;

    return NextResponse.json({ videoUrl, success: true });
  } catch (error) {
    console.error('Video generation error:', error);
    return NextResponse.json(
      { error: 'Video generation failed', success: false },
      { status: 500 }
    );
  }
}