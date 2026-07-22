import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // 确保 limit 是真正的整型数字
    const limit = typeof body.limit === 'number' ? body.limit : 20;
    // 动态读取你的环境变量，与前端保持渠道一致
    const channel = process.env.NEXT_PUBLIC_SALEOR_CHANNEL || 'default-channel';

    const response = await fetch(`${process.env.NEXT_PUBLIC_SALEOR_API_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query GetRandomProducts($limit: Int!, $channel: String!) {
            products(first: $limit, channel: $channel, sortBy: { field: RANDOM }) {
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
          limit: limit,
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
    const products = result?.data?.products?.edges?.map((edge: any) => edge.node) || [];

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