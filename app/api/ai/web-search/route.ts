import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query } = body;

    if (!query) return NextResponse.json({ results: '搜索关键词不能为空' });

    // 使用必应公开网页搜索（无需任何 API Key，永久免费！）
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=3`;
    const searchRes = await fetch(searchUrl, {
      headers: { 
        // 伪装成浏览器，防止必应拦截
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' 
      }
    });

    if (!searchRes.ok) throw new Error(`搜索服务暂时不可用`);

    const html = await searchRes.text();
    const results: string[] = [];
    // 使用正则表达式提取必应网页中的标题和摘要
    const regex = /<li class="b_algo"(?:[^>]*)>[\s\S]*?<h2><a[^>]*>(.*?)<\/a><\/h2>[\s\S]*?<p>(.*?)<\/p>/gi;
    let match;
    while ((match = regex.exec(html)) !== null && results.length < 3) {
      // ✅ 修复 TS 报错的核心：加上 || '' 防止捕获组为空导致 undefined.replace 报错
      const title = (match[1] || '').replace(/<[^>]*>/g, '').trim();
      const snippet = (match[2] || '').replace(/<[^>]*>/g, '').trim();
      
      if (title && snippet) {
        results.push(`[${results.length+1}] ${title}\n摘要：${snippet}`);
      }
    }

    let resultText = `【关于“${query}”的搜索结果】\n`;
    resultText += results.length === 0 ? '未找到相关公开信息。' : '\n' + results.join('\n\n');
    return NextResponse.json({ results: resultText });
    
  } catch (error: any) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { results: `联网搜索出现异常: ${error.message}` },
      { status: 200 }
    );
  }
}