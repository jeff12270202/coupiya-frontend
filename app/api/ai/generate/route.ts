import { NextRequest, NextResponse } from 'next/server';

// 可选：如果在 Vercel 上因生成图片超时，可以加上这行延长超时时间（需 Vercel Pro/团队版，或 Hobby 版默认 10s 可能够用）
// export const maxDuration = 60; 

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // 抽取参数
    const { prompt, width = 512, height = 512 } = body;

    // 从环境变量读取真实的 AI 绘图 API 地址
    const AI_IMAGE_URL = process.env.NEXT_PUBLIC_POLLINATIONS_IMAGE_API_URL || 'https://image.pollinations.ai/prompt';

    // 构建并编码请求 URL
    // 默认使用 512x512
    const encodedPrompt = encodeURIComponent(prompt);
    const targetUrl = `${AI_IMAGE_URL}/${encodedPrompt}?width=${width}&height=${height}&nologin=true`;

    // 返回图像 URL（对于 Pollinations，只需返回 URL 给前端，前端直接 <img src={imageUrl} /> 即可）
    return NextResponse.json({
      imageUrl: targetUrl,
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