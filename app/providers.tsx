'use client';

import { ApolloProvider } from '@apollo/client/react';   // ✅ 正确的导入路径
import { client } from '@/lib/apollo-client';            // 根据你的实际路径调整

export function Providers({ children }: { children: React.ReactNode }) {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}