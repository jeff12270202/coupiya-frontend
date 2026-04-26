'use client';

import { useQuery, gql } from '@apollo/client';
import Image from 'next/image';
import RenderEditorJSON from './RenderEditorJSON';  // 导入富文本渲染组件

interface Product {
  id: string;
  name: string;
  descriptionJson: any;      // 改为 JSON 富文本字段
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
          descriptionJson      # 替换 description
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

const getImageUrl = (url: string) => {
  if (!url) return '/placeholder.png';
  let fixedUrl = url
    .replace(/^https?:\/\/localhost:8000/, 'https://api.coupiya.com')
    .replace(/\/thumbnails\//, '/media/');
  if (fixedUrl.startsWith('http')) return fixedUrl;
  // 相对路径
  return `https://api.coupiya.com${fixedUrl}`;
};

export default function ProductList() {
  const { loading, error, data } = useQuery(GET_PRODUCTS, {
    variables: { first: 8 },
    fetchPolicy: 'network-only',
  });

  if (loading) return <div className="text-center text-gray-500">加载商品中...</div>;
  if (error) return <div className="text-red-500 text-center">出错：{error.message}</div>;
  if (!data?.products?.edges?.length) return <div className="text-center text-gray-500">暂无商品</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {(data.products.edges as ProductEdge[]).map(({ node }) => (
        <div key={node.id} className="bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden shadow hover:shadow-lg transition-shadow flex flex-col">
          <div className="relative h-64 w-full">
            <Image
              src={getImageUrl(node.media[0]?.url)}
              alt={node.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
          </div>
          <div className="p-4 flex flex-col flex-1">
            <h3 className="font-semibold text-lg text-gray-800 dark:text-white">{node.name}</h3>
            
            {/* 富文本描述区域 */}
            <div className="text-gray-600 dark:text-gray-400 text-sm mt-1 line-clamp-3 overflow-hidden">
              {node.descriptionJson ? (
                <RenderEditorJSON data={node.descriptionJson} />
              ) : (
                <p>暂无描述</p>
              )}
            </div>
            
            <div className="mt-4 text-xl font-bold text-indigo-600 dark:text-indigo-400">
              {node.variants[0]?.pricing?.price?.gross.amount} {node.variants[0]?.pricing?.price?.gross.currency}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}