// ============================================================================
// lib/apollo-client.ts —— 全球生产级 Saleor GraphQL 客户端（Apollo Client）
// ----------------------------------------------------------------------------
// 职责：为商城前台（商品列表 / 商品详情 / 推荐位）提供统一 GraphQL 访问。
//
// 相对原版的全部升级：
//   1. 【配置中心】端点不再硬编码，优先读 NEXT_PUBLIC_SALEOR_API_URL（.env.local 已配置
//      https://api.coupiya.com/saleor/graphql/），并做尾部斜杠归一化
//   2. 【CORS 安全】移除 credentials:"include" 与 fetchOptions.mode —— 商城目录为公开数据，
//      跨域携带 Cookie 只会触发额外预检甚至被网关拒绝；Saleor 鉴权走 authorization-bearer 头
//   3. 【鉴权头瘦身】不再发送空 authorization 头（会触发 api.coupiya.com Nginx 的
//      Authorization 覆盖逻辑），仅在有 Token 时发送 Saleor 官方约定的
//      `authorization-bearer` 头；localStorage 读取带 SSR 守卫
//   4. 【分页缓存修复】products 改为标准 connection 合并策略：按 channel 作 keyArgs，
//      有 after 游标时追加 edges（翻页不丢数据），无游标时整页替换（防旧数据残留）
//   5. 错误链路结构化输出，避免把 GraphQL 原始堆栈打满控制台
//   6. 注释明确 App Router 下单例客户端的适用边界（仅客户端组件 / 不跨请求复用缓存）
// ============================================================================

import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { urlTransformerLink } from '@/lib/apolloLinks';

/* ============================================================================
 * 一、配置中心（与全站 CFG 风格一致：环境变量优先 + 归一化兜底）
 * ========================================================================= */

// ---------------------------------------------------------------------------
// 【CORS 修复 · 本次最关键的一处】
// 浏览器端必须走【同源代理】/api/graphql（见 next.config.js 的 rewrites），
// 由 Next.js 服务端转发到 https://api.coupiya.com/saleor/graphql/。
//
// 病因：api.coupiya.com 的 nginx CORS 白名单为
//   coupiya.com | *.vercel.app | dashboard.coupiya.com
// 并不包含 http://localhost:3000。浏览器直连时预检(OPTIONS)返回的
//   Access-Control-Allow-Origin 为空字符串 → 请求被浏览器拦截 →
//   Apollo 的 networkError 即 "TypeError: Failed to fetch"，
//   于是首页「精选 · 东方手作」区块显示「出错：Failed to fetch」。
// 线上（coupiya.com）Origin 在白名单内，所以同样的代码在线上正常。
// ---------------------------------------------------------------------------
const ABSOLUTE_SALEOR_URL = (
  process.env.NEXT_PUBLIC_SALEOR_API_URL ?? 'https://api.coupiya.com/saleor/graphql/'
).replace(/\/+$/, '') + '/'; // 保证恰好一个尾部斜杠

/** 浏览器 → 同源代理；服务端渲染 → 绝对地址直连 Saleor */
const SALEOR_GRAPHQL_URL =
  typeof window !== 'undefined' ? '/api/graphql' : ABSOLUTE_SALEOR_URL;

/** Saleor 鉴权 Token 在浏览器侧的存储键（与登录逻辑约定一致） */
const AUTH_TOKEN_KEY = 'saleorAuthToken';

/* ============================================================================
 * 二、HTTP 链路
 * ========================================================================= */

/**
 * 公开目录查询：不携带 Cookie（credentials 保持默认 same-origin）。
 * 说明：跨域（coupiya.com → api.coupiya.com）携带 Cookie 需要网关开启
 * Access-Control-Allow-Credentials，且会触发复杂预检；商城目录本就公开，
 * 无需 Cookie 会话。若未来接入 Saleor 用户体系，鉴权一律走 authorization-bearer 头。
 */
const httpLink = createHttpLink({
  uri: SALEOR_GRAPHQL_URL,
});

/* ============================================================================
 * 三、鉴权链路（Saleor 官方约定：authorization-bearer 自定义头）
 * ========================================================================= */

const authLink = setContext((_, { headers }) => {
  // SSR 守卫：服务端渲染时 window 不存在，直接返回，不读 localStorage
  let token = '';
  if (typeof window !== 'undefined') {
    try {
      token = window.localStorage.getItem(AUTH_TOKEN_KEY) ?? '';
    } catch {
      token = ''; // 隐私模式 / 禁用存储时静默降级为匿名
    }
  }
  if (!token) return { headers };
  return {
    headers: {
      ...headers,
      // Saleor 官方鉴权头。注意：不使用 authorization（api.coupiya.com Nginx
      // 会覆盖 Authorization，且发送空 authorization 会引发网关异常）。
      'authorization-bearer': token,
    },
  };
});

/* ============================================================================
 * 四、错误链路（结构化输出，不泄漏敏感内容）
 * ========================================================================= */

const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors && graphQLErrors.length > 0) {
    // 只输出 message 与 path，避免 location 等内部细节刷屏
    for (const gqlErr of graphQLErrors) {
      console.error(`[Saleor GraphQL] ${gqlErr.message}`, {
        path: gqlErr.path ?? undefined,
        code: (gqlErr.extensions as { code?: string } | null)?.code ?? undefined,
      });
    }
  }
  if (networkError) {
    console.error('[Saleor Network]', networkError.message);
  }
});

/* ============================================================================
 * 五、缓存策略
 * ========================================================================= */

/** connection 分页合并：有 after 游标时追加 edges（翻页）；否则整页替换（首屏/筛选） */
function mergePaginated<T = unknown>(existing: T | null, incoming: T, args?: { after?: string | null }): T {
  if (!existing) return incoming;
  const after = args?.after;
  if (typeof after === 'string' && after) {
    const prev = existing as { edges?: unknown[] };
    const next = incoming as { edges?: unknown[] };
    return {
      ...incoming,
      edges: [...(prev.edges ?? []), ...(next.edges ?? [])],
    } as T;
  }
  return incoming;
}

const client = new ApolloClient({
  // 链路顺序：错误处理(最外层) → URL 归一化 → 鉴权 → 网络请求
  link: errorLink.concat(urlTransformerLink).concat(authLink.concat(httpLink)),
  cache: new InMemoryCache({
    typePolicies: {
      // Saleor 返回的 id 为全局唯一标识，作为缓存主键稳定可靠
      Product: { keyFields: ['id'] },
      Query: {
        fields: {
          // 商品列表：按 channel 隔离缓存；分页正确合并
          products: {
            keyArgs: ['channel'],
            merge(existing, incoming, { args }) {
              return mergePaginated(existing, incoming, args as { after?: string | null } | undefined);
            },
          },
          // 分类 / 合集同理（如有需要可按此模式扩展）
          categories: {
            keyArgs: ['channel'],
            merge(existing, incoming, { args }) {
              return mergePaginated(existing, incoming, args as { after?: string | null } | undefined);
            },
          },
          collections: {
            keyArgs: ['channel'],
            merge(existing, incoming, { args }) {
              return mergePaginated(existing, incoming, args as { after?: string | null } | undefined);
            },
          },
        },
      },
    },
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    },
    query: {
      // 商城目录要求实时新鲜：查询默认不走缓存直连网络
      fetchPolicy: 'network-only',
      errorPolicy: 'all',
    },
  },
});

/* ============================================================================
 * 六、导出
 * =========================================================================
 *
 * 使用边界（Next.js App Router）：
 *   - 本客户端为模块级单例，适合在【客户端组件】中使用（列表分页、详情、推荐位）；
 *   - 若在 Server Component / 服务端渲染中直接使用，单例会跨请求复用缓存，
 *     请改为「按请求创建」模式（getClient() + per-request new ApolloClient），
 *     或仅使用 network-only 查询并接受共享缓存风险。
 */

export default client;
