"use client";

import { useQuery } from "@apollo/client";
import { GET_PRODUCT } from "@/lib/queries";
import { getMediaUrl } from "@/lib/media-url";
import Image from "next/image";
import { notFound } from "next/navigation";

export default function ProductPage({ params }: { params: { id: string } }) {
  // 1. 解码 URL 中的 ID，防止 + 号变成空格导致 404
  const decodedId = decodeURIComponent(params.id);

  const { data, loading, error } = useQuery(GET_PRODUCT, {
    variables: { id: decodedId },
  });

  // 2. 加载中状态
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900" />
      </div>
    );
  }

  // 3. 未找到或报错状态
  if (error || !data?.product) {
    notFound();
  }

  const product = data.product;

  // 4. 防御性解析 JSON 描述（解决截图中的 JSON 乱码问题）
  const renderDescription = (desc: any) => {
    if (!desc) return null;
    try {
      // 如果是纯文本，直接返回
      if (typeof desc === 'string' && !desc.trim().startsWith('{')) {
        return desc;
      }
      // 如果是 JSON 字符串，解析并提取 blocks 内的文本
      if (typeof desc === 'string' && desc.trim().startsWith('{')) {
        const parsed = JSON.parse(desc);
        if (parsed.blocks && Array.isArray(parsed.blocks)) {
          return parsed.blocks.map((block: any, index: number) => (
            <p key={index} className="mb-2">
              {block.data?.text || block.text || ''}
            </p>
          ));
        }
      }
      return String(desc);
    } catch (e) {
      // 如果解析失败，就原样输出防止页面崩溃
      return String(desc);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 产品图片 (左侧) */}
        <div className="relative">
          {product.media && product.media.length > 0 ? (
            <Image
              src={getMediaUrl(product.media[0]?.url)}
              alt={product.name || "Product image"}
              width={600}
              height={600}
              className="w-full h-auto object-cover rounded-lg"
              priority
              // 如果你后续在 Nginx 修复了跨域，可以把这个 unoptimized 删掉
              unoptimized={!product.media[0]?.url?.includes("media.coupiya.com")}
            />
          ) : (
            <div className="w-full h-96 bg-gray-200 rounded-lg flex items-center justify-center">
              <span className="text-gray-400">No image available</span>
            </div>
          )}

          {/* 缩略图列表 */}
          {product.media && product.media.length > 1 && (
            <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
              {product.media.slice(0, 5).map((media: any, idx: number) => (
                <Image
                  key={idx}
                  src={getMediaUrl(media.url)}
                  alt={`${product.name} - ${idx + 1}`}
                  width={80}
                  height={80}
                  className="w-20 h-20 object-cover rounded border cursor-pointer hover:border-2 hover:border-black"
                  unoptimized
                />
              ))}
            </div>
          )}
        </div>

        {/* 产品信息 (右侧) */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">{product.name}</h1>
          
          {/* 🟢 修复了这里：JSON 已经变成了正常的段落文本 */}
          {product.description && (
            <div className="text-gray-600 text-sm leading-relaxed">
              {renderDescription(product.description)}
            </div>
          )}

          {product.pricing?.priceRange?.start?.gross && (
            <p className="text-2xl font-semibold text-red-600">
              {product.pricing.priceRange.start.gross.amount}{" "}
              {product.pricing.priceRange.start.gross.currency}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}