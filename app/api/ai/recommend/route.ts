import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { limit = 20 } = body;

    // 1. 向后端 Saleor 发起真实的 GraphQL 请求
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
          channel: 'default-channel' // 这里先写死，等后面加了多币种，改成一个变量
        }
      }),
    });

    const result = await response.json();
    const products = result?.data?.products?.edges?.map((edge: any) => edge.node) || [];

    // 2. 直接返回真实商品数据给前端
    return NextResponse.json({
      productIds: products.map((p: any) => p.id),
      recommendations: products,
      success: true
    });
    
  } catch (error) {
    console.error('Recommend API error:', error);
    // 即使出错也返回空列表，保证前端不崩溃
    return NextResponse.json(
      { productIds: [], recommendations: [], success: false, error: '获取推荐失败' },
      { status: 200 }
    );
  }
}