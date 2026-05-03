'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { normalizeImageUrl } from '@/lib/utils';

interface Product {
  id: string;
  name: string;
  descriptionJson?: any;
  media: Array<{ url: string }>;
  variants: Array<{
    pricing: { price: { gross: { amount: number; currency: string } } };
  }>;
}

const extractPlainText = (json: any): string => {
  if (!json?.blocks) return '';
  return json.blocks.map((block: any) => block.data?.text || '').join(' ').slice(0, 60);
};

export default function RecommendSection() {
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channel = process.env.NEXT_PUBLIC_SALEOR_CHANNEL || 'default-channel';

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const fetchRecommendations = async () => {
    try {
      const response = await fetch('/api/ai/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'anonymous', limit: 4 }),
      });

      let productIds: string[] = [];
      if (response.ok) {
        const data = await response.json();
        productIds = data.productIds || data.recommendations || [];
      }

      if (productIds.length === 0) {
        const fallbackRes = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetLatestProducts($first: Int!, $channel: String!) {
                products(first: $first, channel: $channel) {
                  edges {
                    node {
                      id
                      name
                      descriptionJson
                      media { url }
                      variants { pricing { price { gross { amount currency } } } }
                    }
                  }
                }
              }
            `,
            variables: { first: 4, channel },
          }),
        });
        const fallbackData = await fallbackRes.json();
        const edges = fallbackData.data?.products?.edges || [];
        setRecommendations(edges.map((e: any) => e.node));
        setIsLoading(false);
        return;
      }

      const result = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetProductsByIds($ids: [ID!]!, $channel: String!) {
              products(filter: { ids: $ids }, channel: $channel, first: 10) {
                edges {
                  node {
                    id
                    name
                    descriptionJson
                    media { url }
                    variants { pricing { price { gross { amount currency } } } }
                  }
                }
              }
            }
          `,
          variables: { ids: productIds, channel },
        }),
      });
      const graphqlData = await result.json();
      const edges = graphqlData.data?.products?.edges || [];
      setRecommendations(edges.map((edge: any) => edge.node));
    } catch (error) {
      console.error('Recommendation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <section className="container mx-auto px-4 py-16">
        <div className="flex justify-center items-center py-12">
          <div className="animate-pulse text-rose-400">✨ AI 小仙女正在为你挑选陶瓷美物 ✨</div>
        </div>
      </section>
    );
  }

  if (recommendations.length === 0) return null;

  return (
    <section className="container mx-auto px-4 py-16 bg-gradient-to-r from-rose-50 to-amber-50 rounded-3xl my-8">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-white/60 backdrop-blur-sm px-5 py-2 rounded-full shadow-sm mb-4">
          <span className="text-rose-500 text-xl">🎀</span>
          <span className="text-sm font-medium text-rose-600">AI 穿搭灵感</span>
        </div>
        <h2 className="text-4xl font-serif font-bold text-gray-800">专属推荐 · 东方雅韵</h2>
        <p className="text-gray-500 mt-2">根据你的喜好智能生成陶瓷饰品搭配</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-7">
        {recommendations.map((product) => (
          <div key={product.id} className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 group">
            <div className="h-56 overflow-hidden relative bg-amber-50">
              <Image
                src={normalizeImageUrl(product.media?.[0]?.url)}
                alt={product.name}
                fill
              />
            </div>
            <div className="p-5">
              <h3 className="font-serif text-lg font-semibold text-gray-800">{product.name}</h3>
              <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                {product.descriptionJson ? extractPlainText(product.descriptionJson) : '温润细腻，手工匠心'}
              </p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xl font-bold text-rose-500">
                  {product.variants?.[0]?.pricing?.price?.gross.amount || '0'} {product.variants?.[0]?.pricing?.price?.gross.currency || 'CNY'}
                </span>
                <button className="px-4 py-2 text-sm bg-rose-500 text-white rounded-full hover:bg-rose-600 transition shadow-sm">
                  心动收藏
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="text-center mt-10">
        <button className="px-8 py-2 border-2 border-rose-300 text-rose-600 rounded-full hover:bg-rose-50 transition">
          探索更多灵感 →
        </button>
      </div>
    </section>
  );
}