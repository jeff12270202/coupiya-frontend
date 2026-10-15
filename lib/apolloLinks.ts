// ============================================================================
// lib/apolloLinks.ts —— 全球生产级 GraphQL 响应 URL 归一化 Apollo Link
// ----------------------------------------------------------------------------
// 职责：在网络响应写入 Apollo 缓存之前，把响应树中所有 `url` 字段交给
//       normalizeImageUrl()（media.coupiya.com CDN 地址归一化）。
//
// 相对原版的全部升级：
//   1. 【防爆栈】递归加 MAX_DEPTH 上限 + WeakSet 防环（极端结构不崩溃）
//   2. 【fail-open】每个节点独立 try/catch：归一化出错时保留原值，
//      绝不让一次 URL 整形异常杀死整个查询（与全站诚实契约一致）
//   3. 【窄化过滤】仅处理 http(s) 字符串，跳过相对路径 / 空值 / 非字符串
//   4. 【零拷贝优化】无任何变化时返回原引用（不重建对象树），避免每次查询全量 GC
//   5. 类型从 any 收紧为 unknown + 窄化；Link 外层再兜底 try/catch
// ============================================================================

import { ApolloLink, Observable } from '@apollo/client';
import type { FetchResult } from '@apollo/client';
import { normalizeImageUrl } from './media-url';

/** 递归最大深度：超过即视为异常结构，直接透传，防栈溢出 */
const MAX_DEPTH = 16;

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

/**
 * 深度整形：仅重写键名为 `url` 的 http(s) 字符串字段。
 * - 数组/对象逐层递归；无变化时返回原引用（引用相等可被上层短路）
 * - seen 记录已访问对象，防止共享引用/循环导致死循环
 * - 单节点归一化失败 → fail-open 保留原值
 */
function transformUrls(node: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return node;

  if (Array.isArray(node)) {
    let changed = false;
    const out = new Array<unknown>(node.length);
    for (let i = 0; i < node.length; i++) {
      const t = transformUrls(node[i], depth + 1, seen);
      out[i] = t;
      if (t !== node[i]) changed = true;
    }
    return changed ? out : node;
  }

  if (node !== null && typeof node === 'object') {
    if (seen.has(node)) return node; // 环/共享引用保护
    seen.add(node);
    const record = node as Record<string, unknown>;
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      const value = record[key];
      if (key === 'url' && isHttpUrl(value)) {
        try {
          const normalized = normalizeImageUrl(value);
          if (normalized !== value) {
            out[key] = normalized;
            changed = true;
            continue;
          }
        } catch {
          // fail-open：归一化失败保留原值，不影响查询
        }
      }
      const t = transformUrls(value, depth + 1, seen);
      out[key] = t;
      if (t !== value) changed = true;
    }
    return changed ? out : node;
  }

  return node;
}

/**
 * 全局 URL 归一化 Link。
 * 接线（在 apollo-client.ts 中）：
 *   link: errorLink.concat(urlTransformerLink).concat(authLink.concat(httpLink))
 */
export const urlTransformerLink = new ApolloLink((operation, forward) => {
  return new Observable((observer) => {
    const subscription = forward(operation).subscribe({
      next: (result: FetchResult) => {
        if (result.data) {
          try {
            // 网络数据 → Apollo 缓存写入前完成 URL 归一化
            result.data = transformUrls(result.data, 0, new WeakSet()) as FetchResult['data'];
          } catch {
            // 兜底：整形异常时保留原始 data，绝不中断查询
          }
        }
        observer.next(result);
      },
      error: (e) => observer.error(e),
      complete: () => observer.complete(),
    });
    return () => subscription.unsubscribe();
  });
});

/** 导出纯函数，便于单元测试（无需真实 Apollo 环境） */
export { transformUrls };
