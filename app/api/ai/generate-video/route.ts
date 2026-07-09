import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void prompt; // placeholder for video generation
    return NextResponse.json({ 
      videoUrl: "https://media.coupiya.com/placeholder-video.mp4", 
      success: true 
    });
  } catch (error) {
    return NextResponse.json({ error: "Video generation failed", success: false }, { status: 500 });
  }
}
