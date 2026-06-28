import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId: _userId, limit: _limit = 4 } = body;

    // Mock 推荐响应 - 返回空数组以便使用 fallback
    return NextResponse.json({
      productIds: [],
      recommendations: [],
      success: true
    });
  } catch (error) {
    console.error('Recommend API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    );
  }
}
