import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // 确保 limit 是真正的整型数字
    const limit = typeof body.limit === 'number' ? body.limit : 20;
    // 动态读取你的环境变量，与前端保持渠道一致
    const channel = process.env.NEXT_PUBLIC_SALEOR_CHANNEL || 'default-channel';

    // 【修复】端点补兜底，避免环境变量缺失时 fetch 直接抛错
    const saleorUrl = (
      process.env.NEXT_PUBLIC_SALEOR_API_URL ?? 'https://api.coupiya.com/saleor/graphql/'
    ).replace(/\/+$/, '') + '/';

    // 说明：本路由运行在服务端（Node），不受浏览器 CORS 限制，
    // 因此可以直接用绝对地址访问 Saleor。
    const response = await fetch(saleorUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query GetRandomProducts($limit: Int!, $channel: String!) {
            # 【致命修复】原为 sortBy: { field: RANDOM } —— Saleor 不支持 RANDOM，
            # 会返回 400: Expected type "ProductOrderField", found RANDOM.
            # 该错误导致本接口在本地与线上【都】恒返回空数组。
            products(first: $limit, channel: $channel) {
              edges {
                node {
                  id
                  name
                  thumbnail { url }
                  variants {
                    pricing {
                      price {
                        gross { amount currency }
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: {
          // 多取候选（3 倍）供服务端洗牌，效果等同于“随机推荐”
          limit: Math.max(limit * 3, limit),
          channel: channel
        }
      }),
    });

    // =================================================================
    // 【核心修复】：先判断 HTTP 状态码，如果是 400 则直接读取文本，避免 JSON 解析报错
    // =================================================================
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Saleor API 报错 [${response.status}]:`, errorText);
      // 返回空数据给前端，保证前端不崩溃
      return NextResponse.json({
        productIds: [],
        recommendations: [],
        success: false
      });
    }

    const result = await response.json();
    const candidates = result?.data?.products?.edges?.map((edge: any) => edge.node) || [];

    // 服务端洗牌（替代 Saleor 不支持的 sortBy: RANDOM），再截取所需数量
    const products = candidates
      .map((node: any) => ({ node, r: Math.random() }))
      .sort((a: any, b: any) => a.r - b.r)
      .slice(0, limit)
      .map((x: any) => x.node);

    return NextResponse.json({
      productIds: products.map((p: any) => p.id),
      recommendations: products,
      success: true
    });
    
  } catch (error) {
    console.error('Recommend API error:', error);
    return NextResponse.json(
      { productIds: [], recommendations: [], success: false, error: '获取推荐失败' },
      { status: 200 }
    );
  }
}