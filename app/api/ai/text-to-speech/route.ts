import { NextRequest, NextResponse } from 'next/server';

// 工具函数：等待 Replicate 生成任务完成（轮询）
async function waitForReplicate(predictionId: string, apiKey: string) {
  let attempts = 0;
  while (attempts < 30) { // 最多等待 60 秒
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    const data = await res.json();
    if (data.status === 'succeeded') return data.output;
    if (data.status === 'failed') return null;
    await new Promise(r => setTimeout(r, 2000));
    attempts++;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    // =========================================================================
    // 🥇 第 1 层：DeepSeek - 智能润色语音文本（提升读出来的情感和语气）
    // =========================================================================
    let finalText = text;
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
                content: `你是专业的 TTS 文本润色助手。请将用户输入的文字，润色成更加口语化、充满情感、富有感染力的播报文案，以便人工智能语音合成能读出更自然的效果。请不要添加额外解释，只输出润色后的文本。`
              },
              {
                role: 'user',
                content: text
              }
            ],
            max_tokens: 200,
            temperature: 0.7,
          }),
        });
        if (dsRes.ok) {
          const dsData = await dsRes.json();
          const optimizedText = dsData.choices?.[0]?.message?.content?.trim();
          if (optimizedText) finalText = optimizedText;
        }
      } catch (dsError) {
        console.warn('DeepSeek 文本润色失败，使用原文本:', dsError);
      }
    }

    // =========================================================================
    // 🥉 第 3 层：Replicate - 商业级强力语音生成
    // =========================================================================
    const replicateKey = process.env.REPLICATE_API_KEY;
    if (replicateKey) {
      try {
        // 使用 Replicate 的语音合成模型
        const repRes = await fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${replicateKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            version: "speech-5:515ece2bba0be982722aeb518287fb4bed3ce56801e10502c646759fc50f8292",
            input: { text: finalText, speed: 1.0, voice: "aura-asteria-en" }
          }),
        });
        const predData = await repRes.json();
        if (predData.id) {
          const outputUrl = await waitForReplicate(predData.id, replicateKey);
          if (outputUrl) {
            const audioRes = await fetch(outputUrl);
            if (audioRes.ok) {
              // 🔥 修复：直接传递标准的 ArrayBuffer，不再使用 Buffer.from
              const audioArrayBuffer = await audioRes.arrayBuffer();
              return new NextResponse(audioArrayBuffer, {
                headers: { 'Content-Type': 'audio/mpeg' },
              });
            }
          }
        }
      } catch (repError) {
        console.warn('Replicate 语音生成失败，进入 HuggingFace 后备:', repError);
      }
    }

    // =========================================================================
    // 🛡️ 后备层：Hugging Face Inference - 免费语音模型兜底
    // =========================================================================
    const hfToken = process.env.HUGGINGFACE_API_KEY;
    if (hfToken) {
      try {
        const hfRes = await fetch('https://api-inference.huggingface.co/models/facebook/mms-tts-eng', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hfToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: finalText }),
        });
        if (hfRes.ok) {
          // 🔥 修复：直接传递标准的 ArrayBuffer，不再使用 Buffer.from
          const audioArrayBuffer = await hfRes.arrayBuffer();
          return new NextResponse(audioArrayBuffer, {
            headers: { 'Content-Type': 'audio/mpeg' },
          });
        }
      } catch (hfError) {
        console.warn('Hugging Face TTS 后备失败，进入 ElevenLabs 终极兜底:', hfError);
      }
    }

    // =========================================================================
    // 💀 终极兜底：ElevenLabs 极其昂贵的专家级语音
    // =========================================================================
    const elevenlabsKey = process.env.ELEVENLABS_API_KEY;
    if (elevenlabsKey) {
      const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': elevenlabsKey,
        },
        body: JSON.stringify({ 
          text: finalText, 
          voice_settings: { stability: 0.5, similarity_boost: 0.5 } 
        }),
      });
      if (response.ok) {
        // 🔥 修复：直接传递标准的 ArrayBuffer，不再使用 Buffer.from
        const audioArrayBuffer = await response.arrayBuffer();
        return new NextResponse(audioArrayBuffer, {
          headers: { 'Content-Type': 'audio/mpeg' },
        });
      } else {
        throw new Error('ElevenLabs 调用失败');
      }
    }

    // 如果所有层都失败
    throw new Error('所有语音合成服务均不可用');
    
  } catch (error: any) {
    console.error('TTS API error:', error.message);
    return NextResponse.json(
      { error: error.message || '语音生成失败' },
      { status: 500 }
    );
  }
}