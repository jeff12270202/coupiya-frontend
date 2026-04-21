'use client';

import { useQuery, gql } from '@apollo/client';
import Image from 'next/image';

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

interface ProductEdge {
  node: Product;
}

const GET_PRODUCTS = gql`
  query GetProducts($first: Int!) {
    products(first: $first, channel: "default-channel") {
      edges {
        node {
          id
          name
          description
          media { url }
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
`;

// 处理图片 URL：如果是相对路径，拼接完整域名
const getImageUrl = (url: string) => {
  if (!url) return '/placeholder.png';
  if (url.startsWith('http')) return url;
  // 假设后端返回相对路径如 /media/xxx.jpg，则补全域名
  return `process.env.NEXT_PUBLIC_MEDIA_URL${url}`;
};

export default function ProductList() {
  const { loading, error, data } = useQuery(GET_PRODUCTS, {
    variables: { first: 8 },
    fetchPolicy: 'network-only', // 确保每次访问都获取最新数据
  });

  if (loading) return <div className="text-center text-gray-500">加载商品中...</div>;
  if (error) return <div className="text-red-500 text-center">出错：{error.message}</div>;
  if (!data?.products?.edges?.length) return <div className="text-center text-gray-500">暂无商品</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {(data.products.edges as ProductEdge[]).map(({ node }) => (
        <div key={node.id} className="bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden shadow hover:shadow-lg transition-shadow">
          <div className="relative h-64 w-full">
            <Image
              src={getImageUrl(node.media[0]?.url)}
              alt={node.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
          </div>
          <div className="p-4">
            <h3 className="font-semibold text-lg text-gray-800 dark:text-white">{node.name}</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">{node.description?.substring(0, 80)}...</p>
            <div className="mt-2 text-xl font-bold text-indigo-600 dark:text-indigo-400">
              {node.variants[0]?.pricing?.price?.gross.amount} {node.variants[0]?.pricing?.price?.gross.currency}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}