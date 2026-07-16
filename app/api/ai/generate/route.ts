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
    // 抽取参数
    const { prompt, width = 512, height = 512 } = body;

    // 第一层：🥇 DeepSeek - 智能优化提示词（我们绝对优先使用的顶级文本模型）
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
                content: `你是一个资深的 AI 绘画提示词工程师。请将用户的描述转化为适合 Stable Diffusion 或 Midjourney 等 AI 绘图模型生成高质量图片的英文提示词。
要求：直接输出英文提示词，必须包含画质词（masterpiece, best quality）、风格描述、光影与主体细节，不要包含任何解释、对话、引号或多余的说明。`
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
        console.warn('DeepSeek 提示词优化失败，使用原始提示词:', dsError);
      }
    }

    // =========================================================================
    // 第二层：🥈 Pollinations - 极速免费图片生成（首选图片生成服务）
    // =========================================================================
    try {
      const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=${width}&height=${height}&nologin=true`;
      // Pollinations 是直链返回，速度快，作为首选图片获取方式。
      // 不需要等待，直接返回前端让浏览器加载。
      return NextResponse.json({ imageUrl: pollUrl, success: true });
    } catch (pollError) {
      console.warn('Pollinations 首选项失败，准备进入 Replicate:', pollError);
    }

    // =========================================================================
    // 第三层：🥉 Replicate - 强力商业级生图（高性能兜底）
    // =========================================================================
    let imageUrl: string | null = null;
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
            // 使用 SDXL 模型，擅长写实、艺术、插画等多种风格
            version: "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
            input: { prompt: finalPrompt, width: Math.min(1024, width), height: Math.min(1024, height) }
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

    // =========================================================================
    // 第四层：🛡️ Hugging Face Inference - 纯免费开源模型兜底
    // =========================================================================
    if (!imageUrl) {
      const hfKey = process.env.HUGGINGFACE_API_KEY;
      if (hfKey) {
        try {
          // 使用 Hugging Face 的通用 Stable Diffusion 2-1 模型
          const hfRes = await fetch('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1', {
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
      imageUrl = `https://placehold.co/${width}x${height}/f472b6/white?text=${encodeURIComponent('生成服务繁忙')}`;
    }

    return NextResponse.json({ imageUrl, success: true });

  } catch (error) {
    console.error('图片生成 API 严重错误:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false, imageUrl: `https://placehold.co/512x512/ef4444/white?text=生成失败` },
      { status: 500 }
    );
  }
}