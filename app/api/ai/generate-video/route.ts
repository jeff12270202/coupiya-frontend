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

    // =========================================================================
    // 🔥 性能修复：不再返回 base64（会导致 Vercel 内存溢出），
    //    而是上传到 WordPress 媒体库 / MinIO，返回 CDN URL
    // =========================================================================
    try {
      const { uploadToWordPress } = await import('@/lib/wp-upload');
      const fileName = `ai-video-${Date.now()}.mp4`;
      const result = await uploadToWordPress(blob, fileName, 'video/mp4');
      return NextResponse.json({
        videoUrl: result.url,
        mediaId: result.id,
        success: true,
      });
    } catch (uploadError) {
      console.error('WordPress upload failed, using placeholder:', uploadError);
      return NextResponse.json({
        videoUrl: 'https://media.coupiya.com/placeholder-video.mp4',
        success: false,
        message: '视频已生成但上传存储失败，请稍后重试',
      });
    }
  } catch (error) {
    console.error('Video generation error:', error);
    return NextResponse.json(
      { error: 'Video generation failed', success: false },
      { status: 500 }
    );
  }
}