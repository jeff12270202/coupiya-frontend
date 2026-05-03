'use client';

import { useQuery, gql } from '@apollo/client';
import Image from 'next/image';
import Link from 'next/link';
import RenderEditorJSON from './RenderEditorJSON';
import { normalizeImageUrl } from '@/lib/utils';  // 导入新函数

const CHANNEL = process.env.NEXT_PUBLIC_SALEOR_CHANNEL || 'default-channel';

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
      {data.products.edges.map(({ node }: any) => (
        <div key={node.id} className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden flex flex-col">
          <div className="relative h-64 w-full bg-pink-50">
            <Image
              src={normalizeImageUrl(node.media[0]?.url)}  // 使用新函数
              alt={node.name}
              fill 
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