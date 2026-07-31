import { NextRequest, NextResponse } from 'next/server';

// 轮询等待 Replicate 视频生成任务完成
async function waitForReplicate(predictionId: string, apiKey: string) {
  let attempts = 0;
  // 视频生成比图片慢，最多等待约 120 秒 (60次 x 2秒)
  while (attempts < 60) { 
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
    const { prompt } = await req.json();
    if (!prompt) {
      return NextResponse.json({ success: false, error: '缺少 prompt 参数' }, { status: 400 });
    }

    // =========================================================================
    // 🥇 第一层：DeepSeek - 智能润色与优化视频提示词
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
              { role: 'user', content: prompt }
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

    // 最终响应的视频直链
    let videoUrl: string | null = null;

    // =========================================================================
    // 🥈 第二层：Pollinations - 尝试极速获取免费视频直链（用它快速测试）
    // =========================================================================
    if (!videoUrl) {
      try {
        const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?video=true&width=1024&height=576&nologin=true`;
        const pollRes = await fetch(pollUrl);
        if (pollRes.ok) {
          const blob = await pollRes.blob();
          // 只要返回的文件大于 1KB，就认为是有效的视频，交给 publish-movie 去传
          if (blob.size > 1000) {
            // Pollinations 只能返回文件流，没有直链。我们这里为了方便，直接返回一个占位地址。
            // 实际的业务逻辑中，publish-movie 会重新 fetch 这个 pollUrl 并上传。
            // 为保证 generate-video 只返回 URL，我们约定只要成功了，就告诉前端“去 Pollinations 取流”
            // 但更好的做法是直接返回这个生成的 URL 给前端，由前端传给 publish-movie。
            // 因为 Pollinations 无直接直链，如果它成功了，我们直接返回 success: true，并在 message 里提示直接拿去 publish。
            // 为了完美让 publish-movie 直接接收，这里直接返回源地址即可！
            videoUrl = pollUrl; 
            return NextResponse.json({ videoUrl, success: true, source: 'pollinations' });
          }
        }
      } catch (pollError) {
        console.warn('Pollinations 视频生成失败，进入 Replicate 兜底:', pollError);
      }
    }

    // =========================================================================
    // 🥉 第三层：Replicate - 强力商业级视频模型生成（主力生成器）
    // =========================================================================
    if (!videoUrl) {
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
              videoUrl = outputUrl;
              return NextResponse.json({ videoUrl, success: true, source: 'replicate' });
            }
          }
        } catch (repError) {
          console.warn('Replicate 视频生成失败，进入最终后备层:', repError);
        }
      }
    }

    // =========================================================================
    // 🛡️ 最终后备：如果所有服务均不可用，返回统一的占位视频占位符
    // （确保 publish-movie 拿到这个 URL 后，直接上传进去，保证流程不中断）
    // =========================================================================
    if (!videoUrl) {
      // 返回一个明确的占位符，方便前端判断并给出提示，也可以配置真实的占位视频
      console.warn('所有视频服务耗尽，返回标准占位视频');
      return NextResponse.json({
        videoUrl: 'https://media.coupiya.com/placeholder-video.mp4', // 请注意：此 URL 需在服务器上实际存在
        success: false,
        message: '所有 AI 视频生成服务暂时失败，采用了备用演示视频',
      });
    }

    return NextResponse.json({ videoUrl, success: true });

  } catch (error: any) {
    console.error('视频生成 API 严重错误:', error.message);
    return NextResponse.json(
      { error: 'Video generation internal error', success: false },
      { status: 500 }
    );
  }
}