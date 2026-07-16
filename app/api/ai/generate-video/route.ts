import { NextRequest, NextResponse } from 'next/server';

// 工具函数：等待 Replicate 生成任务完成（轮询）
async function waitForReplicate(predictionId: string, apiKey: string) {
  let attempts = 0;
  while (attempts < 30) { // 最多等待约 60 秒
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    const data = await res.json();
    if (data.status === 'succeeded') return data.output?.[0] || null;
    if (data.status === 'failed') return null;
    await new Promise(r => setTimeout(r, 2000)); // 每 2 秒轮询一次
    attempts++;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt } = body;

    // =========================================================================
    // 🥇 第一层：DeepSeek - 智能润色与优化提示词（文本模型的主力）
    // =========================================================================
    let finalPrompt = prompt;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (deepseekKey) {
      try {
        const dsRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
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
                content: `你是一个资深的 AI 视频生成提示词工程师。请将用户的描述转化为适合 AI 视频模型生成动态视频的高质量英文提示词。
要求：直接输出英文提示词，包含场景动态变化、镜头运动、光影流动与主体细节。不要包含任何解释、对话、引号或多余说明。`
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 300,
            temperature: 0.7,
          }),
        });

        if (dsRes.ok) {
          const dsData = await dsRes.json();
          const optimizedPrompt = dsData.choices?.[0]?.message?.content?.trim();
          if (optimizedPrompt) finalPrompt = optimizedPrompt;
        }
      } catch (dsError) {
        console.warn('DeepSeek 视频提示词优化失败，使用原始提示词:', dsError);
      }
    }

    // 声明用于最终响应的变量
    let videoBlob: Blob | null = null;
    let videoUrl: string | null = null;

    // =========================================================================
    // 🥈 第二层：Pollinations - 尝试极速获取免费视频直链
    // =========================================================================
    if (!videoBlob && !videoUrl) {
      try {
        // Pollinations 支持在 URL 后加上 ?video=true 生成短视频
        const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?video=true&width=1024&height=576&nologin=true`;
        const pollRes = await fetch(pollUrl);
        if (pollRes.ok) {
          const blob = await pollRes.blob();
          if (blob.size > 1000) {
            videoBlob = blob;
          } else {
            // 如果 Pollinations 返回了视频直链但文件太小，可能是一个空响应，继续往后走
          }
        }
      } catch (pollError) {
        console.warn('Pollinations 视频生成失败，进入 Replicate 兜底:', pollError);
      }
    }

    // =========================================================================
    // 🥉 第三层：Replicate - 强力商业级视频模型生成
    // =========================================================================
    if (!videoBlob) {
      const replicateKey = process.env.REPLICATE_API_KEY;
      if (replicateKey) {
        try {
          const replicateRes = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
              'Authorization': `Token ${replicateKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              version: "stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438",
              input: { prompt: finalPrompt }
            }),
          });
          const predData = await replicateRes.json();
          if (predData.id) {
            const outputUrl = await waitForReplicate(predData.id, replicateKey);
            if (outputUrl) {
              const repRes = await fetch(outputUrl);
              if (repRes.ok) {
                videoBlob = await repRes.blob();
              }
            }
          }
        } catch (repError) {
          console.warn('Replicate 视频生成失败，进入最终后备层:', repError);
        }
      }
    }

    // =========================================================================
    // 🛡️ 后备层：Hugging Face Inference - 开源模型兜底（兼容原占位视频）
    // =========================================================================
    if (!videoBlob) {
      const hfToken = process.env.HUGGINGFACE_API_KEY;
      if (hfToken) {
        try {
          const hfRes = await fetch(
            'https://api-inference.huggingface.co/models/stabilityai/stable-video-diffusion',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${hfToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ inputs: finalPrompt }),
            }
          );

          if (hfRes.ok) {
            videoBlob = await hfRes.blob();
          } else {
            // 若 HuggingFace 也受限或失败，直接返回占位视频
            return NextResponse.json({
              videoUrl: 'https://media.coupiya.com/placeholder-video.mp4',
              success: false,
              message: '使用占位视频（所有 AI 生成层均失败或超时）',
            });
          }
        } catch (hfError) {
          console.warn('HuggingFace 视频生成后备失败，返回占位:', hfError);
          return NextResponse.json({
            videoUrl: 'https://media.coupiya.com/placeholder-video.mp4',
            success: false,
            message: '使用占位视频（Hugging Face 调用失败）',
          });
        }
      } else {
        return NextResponse.json({
          videoUrl: 'https://media.coupiya.com/placeholder-video.mp4',
          success: false,
          message: '使用占位视频（未配置任何 AI 视频 Key）',
        });
      }
    }

    // =========================================================================
    // 📤 最终统一处理：将生成的视频上传到 WordPress 媒体库 / MinIO，返回 CDN URL
    // =========================================================================
    try {
      // 动态引入避免打包时把 wp-upload 强制塞入服务端
      const { uploadToWordPress } = await import('@/lib/wp-upload');
      const fileName = `ai-video-${Date.now()}.mp4`;
      const result = await uploadToWordPress(videoBlob, fileName, 'video/mp4');

      return NextResponse.json({
        videoUrl: result.url,
        mediaId: result.id,
        success: true,
      });
    } catch (uploadError) {
      console.error('WordPress 上传失败，使用占位视频:', uploadError);
      return NextResponse.json({
        videoUrl: 'https://media.coupiya.com/placeholder-video.mp4',
        success: false,
        message: '视频已生成但上传存储失败，请稍后重试',
      });
    }

  } catch (error) {
    console.error('视频生成 API 严重错误:', error);
    return NextResponse.json(
      { error: 'Video generation failed', success: false },
      { status: 500 }
    );
  }
}