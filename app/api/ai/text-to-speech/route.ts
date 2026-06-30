import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    const elevenlabsKey = process.env.ELEVENLABS_API_KEY;

    if (!elevenlabsKey) {
      return NextResponse.json({ error: 'Missing ELEVENLABS_API_KEY' }, { status: 500 });
    }

    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenlabsKey,
      },
      body: JSON.stringify({ 
        text, 
        voice_settings: { stability: 0.5, similarity_boost: 0.5 } 
      }),
    });

    // ✅ 关键一步：如果 ElevenLabs 接口失败，直接返回 JSON 错误给前端，而不是崩溃
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail?.message || '语音生成接口调用失败');
    }

    const audioBuffer = await response.arrayBuffer();
    return new NextResponse(audioBuffer, {
      headers: { 'Content-Type': 'audio/mpeg' },
    });

  } catch (error: any) {
    console.error('TTS API error:', error.message);
    return NextResponse.json(
      { error: error.message || '语音生成失败' },
      { status: 500 }
    );
  }
}