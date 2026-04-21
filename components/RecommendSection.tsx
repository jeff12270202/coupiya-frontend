'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

// 定义商品数据类型
interface Product {
  id: string;
  name: string;
  description: string;
  media: Array<{ url: string }>;
  variants: Array<{
    pricing: {
      price: {
        gross: {
          amount: number;
          currency: string;
        };
      };
    };
  }>;
}

// GraphQL 响应中 edges 节点的类型
interface ProductEdge {
  node: Product;
}

// 处理图片 URL：如果是相对路径，拼接完整域名
const getImageUrl = (url: string | undefined) => {
  if (!url) return 'https://placehold.co/400x300/6366F1/white?text=Product';
  if (url.startsWith('http')) return url;
  // 假设后端返回相对路径如 /media/xxx.jpg，则补全域名
  return `process.env.NEXT_PUBLIC_MEDIA_URL${url}`;
};

export default function RecommendSection() {
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      } else {
        // Mock recommendation IDs (using demo IDs)
        productIds = ['UHJvZHVjdDox', 'UHJvZHVjdDoy', 'UHJvZHVjdDo0', 'UHJvZHVjdDo1'];
      }

      // Fetch product details from Saleor
      if (productIds.length > 0) {
        const result = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetProductsByIds($ids: [ID!]!) {
                products(filter: { ids: $ids }, channel: "default-channel", first: 10) {
                  edges { node { id name description media { url } variants { pricing { price { gross { amount currency } } } } } }
                }
              }
            `,
            variables: { ids: productIds },
          }),
        });
        const graphqlData = await result.json();
        const edges: ProductEdge[] = graphqlData.data?.products?.edges || [];
        setRecommendations(edges.map((edge: ProductEdge) => edge.node));
      }
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
          <div className="animate-pulse text-gray-500">AI正在为你生成个性化推荐...</div>
        </div>
      </section>
    );
  }

  if (recommendations.length === 0) return null;

  return (
    <section className="container mx-auto px-4 py-16 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-gray-800 dark:to-gray-900">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-indigo-100 dark:bg-indigo-900/50 px-4 py-2 rounded-full mb-4">
          <span className="text-indigo-600 dark:text-indigo-400">🤖</span>
          <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">AI智能推荐</span>
        </div>
        <h2 className="text-3xl font-bold text-gray-800 dark:text-white">为您推荐</h2>
        <p className="text-gray-600 dark:text-gray-300 mt-2">基于深度学习的个性化推荐系统</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {recommendations.map((product: Product) => (
          <div key={product.id} className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
            <div className="h-48 overflow-hidden relative">
              <Image
                src={getImageUrl(product.media?.[0]?.url)}
                alt={product.name}
                fill
                className="object-cover hover:scale-105 transition-transform duration-300"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              />
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-gray-800 dark:text-white mb-1">{product.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                {product.description?.replace(/<[^>]*>/g, '').slice(0, 60)}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  {product.variants?.[0]?.pricing?.price?.gross.amount || '0'}{' '}
                  {product.variants?.[0]?.pricing?.price?.gross.currency || 'CNY'}
                </span>
                <button className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                  查看详情
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center mt-8">
        <button className="px-6 py-2 border border-indigo-600 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
          更多推荐 →
        </button>
      </div>
    </section>
  );
}