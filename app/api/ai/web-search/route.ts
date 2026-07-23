import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query } = body;

    if (!query) {
      return NextResponse.json({ results: '搜索关键词不能为空' });
    }

    // 获取客户端语言偏好（实现全球多语言搜索支持）
    const acceptLanguage = req.headers.get('accept-language') || 'zh-CN';
    // ✅ 【关键修复】：使用可选链 ?. 和 空值合并运算符 ??，彻底解决 TS 可能为 undefined 的报错
    const targetLang = acceptLanguage?.split(',')[0]?.split('-')[0] ?? 'zh';

    // ⚠️ 注意：请前往 https://serpapi.com/ 注册并获取免费的 API KEY
    // 如果没有 SerpApi，你可以换成你其他的搜索引擎或免费聚合搜索 API
    const serpApiKey = process.env.SERPAPI_API_KEY; 
    
    // 构建真实第三方搜索请求
    const searchUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&hl=${targetLang}&api_key=${serpApiKey}`;

    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      throw new Error(`搜索服务暂时无法访问 (${searchRes.status})`);
    }

    const searchData = await searchRes.json();
    
    // 提取核心搜索结果 (只取前3条纯文本摘要，防止 Token 爆炸)
    const organicResults = searchData.organic_results || [];
    let resultText = `【关于“${query}”的搜索结果】\n`;
    
    if (organicResults.length === 0) {
      resultText += '未找到相关公开信息。';
    } else {
      organicResults.slice(0, 3).forEach((item: any, index: number) => {
        const title = item.title || '无标题';
        const snippet = item.snippet || '暂无摘要';
        resultText += `\n[${index + 1}] ${title}\n摘要：${snippet}\n`;
      });
    }

    return NextResponse.json({ results: resultText });
    
  } catch (error: any) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { results: `联网搜索出现异常: ${error.message}` },
      { status: 200 } // 状态码保持 200，让 AI 来消化这个错误，而不是让前端报错
    );
  }
}