import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const perPage = searchParams.get('per_page') || '15';
  const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

  // 如果在服务器端没读到 Key，说明 .env.local 没配置好
  if (!PEXELS_API_KEY) {
    console.error('❌ 服务器端缺少 PEXELS_API_KEY 环境变量');
    return NextResponse.json({ error: 'API Key missing' }, { status: 500 });
  }

  try {
    // 由您的服务器去请求 Pexels（绕过了浏览器的跨域拦截）
    const res = await fetch(`https://api.pexels.com/videos/popular?per_page=${perPage}`, {
      headers: {
        Authorization: PEXELS_API_KEY,
      },
      // 开启缓存，频繁刷新不会过度消耗您的配额
      next: { revalidate: 3600 }, 
    });

    if (!res.ok) {
      throw new Error(`Pexels API error: ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ Pexels 代理异常:', error);
    return NextResponse.json({ error: 'Failed to fetch videos' }, { status: 500 });
  }
}