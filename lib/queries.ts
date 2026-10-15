// ============================================================================
// lib/queries.ts —— 全球生产级 Saleor GraphQL 查询定义（集中式）
// ----------------------------------------------------------------------------
// 职责：全站商城前台（商品列表 / 商品详情 / 推荐位兜底）的统一查询定义。
//
// 相对原版的全部升级：
//   1. 【致命修复】所有查询补上 $channel 参数 —— Saleor 的 pricing 按 channel
//      隔离，不传 channel 时 priceRange 恒为 null，价格永远取不到
//   2. 【字段补全】补 slug（详情页按 slug 路由）、media.alt/type（无障碍与
//      图片/视频区分）、descriptionPlaintext（SEO 元描述 / 列表纯文本）、
//      seoTitle/seoDescription（详情页 meta）、category（面包屑导航）
//   3. 【价格区间】priceRange 同时取 start/stop（区间价），并补
//      priceRangeUndiscounted（划线价/折扣展示）
//   4. 【防重复】抽 PRODUCT_MEDIA_FRAGMENT / PRODUCT_FIELDS_FRAGMENT 片段，
//      多个查询共用，字段定义永不漂移
//   5. 【分页】GET_PRODUCTS 带 first/after + pageInfo（endCursor/hasNextPage），
//      与 apollo-client.ts 的 connection 合并策略配套
//   6. 【契约注释】description 为 JSONString（富文本），渲染前必须 JSON.parse；
//      descriptionPlaintext 为纯文本，供列表/SEO 直接使用
// ============================================================================

import { gql } from '@apollo/client';

/* ============================================================================
 * 一、片段（Fragment）—— 字段定义只写一次
 * ========================================================================= */

/** 媒体字段：url 会在 apolloLinks.ts 中被归一化到 media.coupiya.com */
export const PRODUCT_MEDIA_FRAGMENT = gql`
  fragment ProductMediaFields on ProductMedia {
    id
    url
    alt
    type
  }
`;

/** 商品核心字段（列表 / 详情共用） */
export const PRODUCT_FIELDS_FRAGMENT = gql`
  fragment ProductFields on Product {
    id
    slug
    name
    description
    descriptionPlaintext
    seoTitle
    seoDescription
    category {
      id
      name
      slug
    }
    media {
      ...ProductMediaFields
    }
    pricing {
      priceRange {
        start {
          gross {
            amount
            currency
          }
        }
        stop {
          gross {
            amount
            currency
          }
        }
      }
      priceRangeUndiscounted {
        start {
          gross {
            amount
            currency
          }
        }
        stop {
          gross {
            amount
            currency
          }
        }
      }
    }
  }
  ${PRODUCT_MEDIA_FRAGMENT}
`;

/* ============================================================================
 * 二、查询
 * ========================================================================= */

/**
 * 按 ID 查单个商品（商品详情页）
 * 注意：`description` 是 JSONString（富文本），渲染前必须 JSON.parse()；
 *       `descriptionPlaintext` 是纯文本，可直接用于 meta / 列表摘要。
 */
export const GET_PRODUCT = gql`
  query GetProduct($id: ID!, $channel: String!) {
    product(id: $id, channel: $channel) {
      ...ProductFields
    }
  }
  ${PRODUCT_FIELDS_FRAGMENT}
`;

/**
 * 按 slug 查单个商品（SEO 友好的详情页路由：/product/[slug]）
 */
export const GET_PRODUCT_BY_SLUG = gql`
  query GetProductBySlug($slug: String!, $channel: String!) {
    product(slug: $slug, channel: $channel) {
      ...ProductFields
    }
  }
  ${PRODUCT_FIELDS_FRAGMENT}
`;

/**
 * 商品列表（分页）—— 供商城列表页 / 推荐位兜底使用。
 * $first/$after 与 apollo-client.ts 中 products 的 connection 合并策略配套：
 * 有 after 游标时追加 edges，首屏/筛选时整页替换。
 */
export const GET_PRODUCTS = gql`
  query GetProducts($channel: String!, $first: Int = 12, $after: String) {
    products(channel: $channel, first: $first, after: $after) {
      edges {
        node {
          ...ProductFields
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
  ${PRODUCT_FIELDS_FRAGMENT}
`;
