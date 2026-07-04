// ============================================================
// FIXED: lib/apollo-client.ts
// 修复 GraphQL endpoint: 必须使用 https://api.coupiya.com/saleor/graphql/
// 绝对不能用 localhost:8009 或其他内部地址
// ============================================================

import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { onError } from "@apollo/client/link/error";

// GraphQL endpoint - 通过 nginx 反向代理访问 Saleor
// nginx: api.coupiya.com/saleor/graphql/ → 10.136.131.76:8009/graphql/
const SALEOR_GRAPHQL_URL = "https://api.coupiya.com/saleor/graphql/";

const httpLink = createHttpLink({
  uri: SALEOR_GRAPHQL_URL,
  credentials: "include",
  // 确保 fetch 不使用内部代理
  fetchOptions: {
    mode: "cors",
  },
});

// 错误处理 link
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path }) =>
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
      )
    );
  }
  if (networkError) {
    console.error(`[Network error]: ${networkError}`);
  }
});

// 认证 link - 如果需要的话
const authLink = setContext((_, { headers }) => {
  // 从 localStorage 获取 token（如果有的话）
  const token =
    typeof window !== "undefined" ? localStorage.getItem("authToken") : null;

  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "",
      // Saleor 也支持 authorization-bearer header
      "authorization-bearer": token || "",
    },
  };
});

// 创建 Apollo Client
const client = new ApolloClient({
  link: errorLink.concat(authLink.concat(httpLink)),
  cache: new InMemoryCache({
    typePolicies: {
      Product: {
        // 使用 id 作为缓存 key
        keyFields: ["id"],
      },
      Query: {
        fields: {
          products: {
            // 合并分页数据
            merge(existing, incoming) {
              return incoming;
            },
          },
        },
      },
    },
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: "cache-and-network",
      errorPolicy: "all",
    },
    query: {
      fetchPolicy: "network-only",
      errorPolicy: "all",
    },
  },
});

export default client;
