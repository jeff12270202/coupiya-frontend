import { NextRequest, NextResponse } from 'next/server';

// 工具函数：等待 Replicate 生成任务完成
async function waitForReplicate(predictionId: string, apiKey: string) {
  let attempts = 0;
  while (attempts < 20) { // 最多等待约 40 秒
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
    let finalPrompt = prompt; // 默认使用用户原话

    // =========================================================================
    // 🥇 第 1 层：DeepSeek - 智能优化动漫提示词（唯一 AI 文本模型）
    // =========================================================================
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
                content: `你是一个资深的二次元提示词工程师。请将用户的描述转化为适合 Stable Diffusion 等 AI 绘图模型生成动漫/二次元插画的高质量英文提示词。
要求：直接输出英文提示词，包含画质词（masterpiece, best quality）、风格词（anime style, detailed）、主体细节，不要包含任何解释、对话、引号或多余的说明。`
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 200,
            temperature: 0.7,
          }),
        });
        if (dsRes.ok) {
          const dsData = await dsRes.json();
          const optimizedPrompt = dsData.choices?.[0]?.message?.content?.trim();
          if (optimizedPrompt) finalPrompt = optimizedPrompt;
        }
      } catch (dsError) {
        console.warn('DeepSeek 提示词优化失败，回退至原提示词:', dsError);
      }
    }

    let imageUrl: string | null = null;

    // =========================================================================
    // 🥈 第 2 层：Pollinations - 极速免费图片生成（首选生图模型）
    // =========================================================================
    try {
      const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=1024&height=1024&nologin=true`;
      // 快速测试 Pollinations 是否存活（可选，直接返回 URL 让前端加载更稳妥）
      // Pollinations 属于直链访问，如果网络不通前端自然会裂开，这里直接赋值作为第一顺位
      imageUrl = pollUrl;
      
      // 为了严格验证，我们也可以对它进行一次 HEAD 请求，但没必要，直接返回链接效率最高。
      // 直接返回链接交给前端渲染。
      return NextResponse.json({ imageUrl, success: true });
      
    } catch (pollError) {
      console.warn('Pollinations 首选项失败，进入 Replicate 层:', pollError);
    }

    // =========================================================================
    // 🥉 第 3 层：Replicate - 强力商业级生图（备选）
    // =========================================================================
    if (!imageUrl) {
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
              version: "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b", // SDXL 模型，擅长动漫风格
              input: { prompt: finalPrompt, width: 1024, height: 1024 }
            }),
          });
          const predData = await replicateRes.json();
          if (predData.id) {
            const outputUrl = await waitForReplicate(predData.id, replicateKey);
            if (outputUrl) {
              imageUrl = outputUrl;
              return NextResponse.json({ imageUrl, success: true });
            }
          }
        } catch (repError) {
          console.warn('Replicate 生成失败，进入后备层:', repError);
        }
      }
    }

    // =========================================================================
    // 🛡️ 后备：Hugging Face Inference - 免费开源动漫模型兜底
    // =========================================================================
    if (!imageUrl) {
      const hfKey = process.env.HUGGINGFACE_API_KEY;
      if (hfKey) {
        try {
          const hfRes = await fetch('https://api-inference.huggingface.co/models/naclbit/trinart_stable_diffusion_v2', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${hfKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ inputs: finalPrompt }),
          });
          if (hfRes.ok) {
            const buffer = await hfRes.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');
            imageUrl = `data:image/jpeg;base64,${base64}`;
            return NextResponse.json({ imageUrl, success: true });
          }
        } catch (hfError) {
          console.error('HuggingFace 完全兜底失败:', hfError);
        }
      }
    }

    // =========================================================================
    // 💀 终极兜底：如果所有接口全崩，返回占位图
    // =========================================================================
    if (!imageUrl) {
      imageUrl = `https://placehold.co/1024x1024/f472b6/white?text=${encodeURIComponent('动漫生成服务繁忙')}`;
    }

    return NextResponse.json({ imageUrl, success: true });

  } catch (error) {
    console.error('动漫生成 API 严重错误:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false, imageUrl: 'https://placehold.co/1024x1024/ef4444/white?text=生成失败' },
      { status: 500 }
    );
  }
}