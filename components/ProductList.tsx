'use client';

import { useQuery, gql } from '@apollo/client';
import Image from 'next/image';
import Link from 'next/link';
import RenderEditorJSON from './RenderEditorJSON';

interface Product {
  id: string;
  name: string;
  descriptionJson: any;
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

// 正确渠道名（根据你的 Saleor Dashboard 调整，可使用环境变量）
const CHANNEL = process.env.NEXT_PUBLIC_SALEOR_CHANNEL || 'Channel-USD,default-channel,channel-pln';

const GET_PRODUCTS = gql`
  query GetProducts($first: Int!, $channel: String!) {
    products(first: $first, channel: $channel) {
      edges {
        node {
          id
          name
          descriptionJson
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

const getImageUrl = (url: string | undefined): string => {
  if (!url) return '/placeholder.png';
  if (url.startsWith('http')) return url;
  return `https://api.coupiya.com${url}`;
};

export default function ProductList() {
  const { loading, error, data } = useQuery(GET_PRODUCTS, {
    variables: { first: 8, channel: CHANNEL },
    fetchPolicy: 'network-only',
  });

  if (loading) return <div className="text-center text-gray-500">加载商品中...</div>;
  if (error) {
    console.error('GraphQL error:', error);
    return <div className="text-red-500 text-center">出错：{error.message}</div>;
  }
  if (!data?.products?.edges?.length) return <div className="text-center text-gray-500">暂无商品，后台请先添加陶瓷饰品 🎋</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {(data.products.edges as ProductEdge[]).map(({ node }) => (
        <div key={node.id} className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden flex flex-col">
          <div className="relative h-64 w-full bg-pink-50">
            <Image
              src={getImageUrl(node.media[0]?.url)}
              alt={node.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
          </div>
          <div className="p-5 flex flex-col flex-1">
            <h3 className="font-serif text-xl font-semibold text-gray-800 mb-1">{node.name}</h3>
            <div className="text-gray-600 text-sm mt-1 line-clamp-3 overflow-hidden prose prose-sm max-w-none">
              {node.descriptionJson ? (
                <RenderEditorJSON data={node.descriptionJson} />
              ) : (
                <p className="text-gray-400 italic">暂无描述</p>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-2xl font-bold text-rose-500">
                {node.variants[0]?.pricing?.price?.gross.amount || '0'} {node.variants[0]?.pricing?.price?.gross.currency || 'CNY'}
              </span>
              <Link href={`/product/${node.id}`} className="px-4 py-2 text-sm bg-rose-100 text-rose-600 rounded-full hover:bg-rose-200 transition-colors inline-block text-center">
                查看详情
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}