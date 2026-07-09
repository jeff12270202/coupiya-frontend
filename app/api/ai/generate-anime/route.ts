import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    return NextResponse.json({ 
      imageUrl: "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt), 
      success: true 
    });
  } catch (error) {
    return NextResponse.json({ error: "Anime generation failed", success: false }, { status: 500 });
  }
}
