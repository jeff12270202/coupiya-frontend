'use client';

export const dynamic = 'force-dynamic';

import { useQuery, gql } from '@apollo/client';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import RenderEditorJSON from '@/components/RenderEditorJSON';
import { useCart } from '@/hooks/useCart';

const GET_PRODUCT = gql`
  query GetProduct($id: ID!, $channel: String!) {
    product(id: $id, channel: $channel) {
      id
      name
      descriptionJson
      media { url }
      variants {
        id
        name
        pricing {
          price {
            gross { amount currency }
          }
        }
      }
    }
  }
`;

// ⚠️ 直接写死正确的渠道名，防止环境变量读取失效
const CHANNEL = 'default-channel'; 

export default function ProductDetail() {
  // ✅ Step 1: 必须先解码 URL 中的 %3D%3D，否则 GraphQL 会报 Invalid ID
  const rawId = useParams().id as string;
  const id = decodeURIComponent(rawId);

  const { addItem, loading: cartLoading } = useCart();
  const { loading, error, data } = useQuery(GET_PRODUCT, {
    variables: { id, channel: CHANNEL },
    skip: !id,
  });

  if (loading) return <div className="text-center py-20">加载商品中...</div>;
  if (error) return <div className="text-red-500 text-center py-20">出错：{error.message}</div>;
  
  const product = data?.product;
  if (!product) return <div className="text-center py-20">商品不存在</div>;

  const firstVariant = product.variants?.[0];
  const variantId = firstVariant?.id;
  const price = firstVariant?.pricing?.price?.gross.amount || 0;
  const currency = firstVariant?.pricing?.price?.gross.currency || 'CNY';

  const handleAddToCart = async () => {
    if (!variantId) {
      alert('该商品暂无有效变体，无法购买');
      return;
    }
    try {
      await addItem(variantId, 1);
      alert('已加入购物车');
    } catch (err: any) {
      alert('添加失败：' + err.message);
    }
  };

  // ✅ Step 3: 处理图片路径，如果返回的是相对路径，强制拼上 media 域名
  const rawImageUrl = product.media?.[0]?.url;
  const imageUrl = rawImageUrl?.startsWith('http') 
    ? rawImageUrl 
    : `https://media.coupiya.com${rawImageUrl}`;

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <Link href="/" className="text-rose-500 hover:underline inline-block mb-6">
        ← 返回首页
      </Link>
      <div className="grid md:grid-cols-2 gap-12">
        <div className="bg-rose-50 rounded-2xl overflow-hidden shadow-md">
          {product.media?.[0]?.url && (
            <Image
              src={imageUrl} // ✅ 使用处理过的图片地址
              alt={product.name}
              width={600}
              height={600}
              className="w-full h-auto object-cover"
            />
          )}
        </div>
        <div>
          <h1 className="text-4xl font-serif font-bold text-gray-800 mb-3">{product.name}</h1>
          <div className="text-3xl font-bold text-rose-500 mb-6">
            {price} {currency}
          </div>
          <div className="prose prose-rose max-w-none mb-8">
            {product.descriptionJson ? (
              <RenderEditorJSON data={product.descriptionJson} />
            ) : (
              <p className="text-gray-500">暂无详细描述</p>
            )}
          </div>
          <button
            onClick={handleAddToCart}
            disabled={cartLoading || !variantId}
            className="w-full py-3 bg-rose-500 text-white rounded-full font-semibold hover:bg-rose-600 transition disabled:opacity-50"
          >
            {cartLoading ? '处理中...' : '加入购物车'}
          </button>
          {!variantId && (
            <p className="text-sm text-amber-600 mt-2">⚠️ 该商品暂无可售款式（缺少变体）</p>
          )}
        </div>
      </div>
    </div>
  );
}