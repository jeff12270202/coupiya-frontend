// ============================================================
// FIXED: app/product/[id]/page.tsx
// 修复图片 URL - 将 Saleor 返回的 localhost/minio 内部地址
// 重写为 https://media.coupiya.com 专用媒体域名
// ============================================================

"use client";

import { useQuery } from "@apollo/client";
import { GET_PRODUCT } from "@/lib/queries";
import { getMediaUrl } from "@/lib/media-url";
import Image from "next/image";
import { notFound } from "next/navigation";

export default function ProductPage({ params }: { params: { id: string } }) {
  const decodedId = decodeURIComponent(params.id);

  const { data, loading, error } = useQuery(GET_PRODUCT, {
    variables: { id: decodedId },
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (error || !data?.product) {
    notFound();
  }

  const product = data.product;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 产品图片 */}
        <div className="relative">
          {product.media && product.media.length > 0 ? (
            <Image
              src={getMediaUrl(product.media[0]?.url)}
              alt={product.name || "Product image"}
              width={600}
              height={600}
              className="w-full h-auto object-cover rounded-lg"
              priority
              unoptimized={
                !product.media[0]?.url?.includes("media.coupiya.com")
              }
            />
          ) : (
            <div className="w-full h-96 bg-gray-200 rounded-lg flex items-center justify-center">
              <span className="text-gray-400">No image available</span>
            </div>
          )}

          {/* 缩略图列表 */}
          {product.media && product.media.length > 1 && (
            <div className="flex gap-2 mt-4 overflow-x-auto">
              {product.media.slice(0, 5).map((media: any, idx: number) => (
                <Image
                  key={idx}
                  src={getMediaUrl(media.url)}
                  alt={`${product.name} - ${idx + 1}`}
                  width={80}
                  height={80}
                  className="w-20 h-20 object-cover rounded border cursor-pointer"
                  unoptimized
                />
              ))}
            </div>
          )}
        </div>

        {/* 产品信息 */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">{product.name}</h1>
          {product.description && (
            <p className="text-gray-600">{product.description}</p>
          )}
          {product.pricing?.priceRange?.start?.gross && (
            <p className="text-2xl font-semibold">
              {product.pricing.priceRange.start.gross.amount}{" "}
              {product.pricing.priceRange.start.gross.currency}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
