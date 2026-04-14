import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
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
    body: JSON.stringify({ text, voice_settings: { stability: 0.5, similarity_boost: 0.5 } }),
  });

  const audioBuffer = await response.arrayBuffer();
  return new NextResponse(audioBuffer, {
    headers: { 'Content-Type': 'audio/mpeg' },
  });
}