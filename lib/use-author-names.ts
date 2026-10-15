'use client';

// ============================================================================
// lib/use-author-names.ts —— 作者昵称批量解析 Hook（电影墙「作者：@xxx」真名化）
// ----------------------------------------------------------------------------
// 用法：把卡片上的 author_user_id 列表传入，返回 { [userId]: nickname } 映射；
//       内部去重 + 去空 + 单飞（同一批只请求一次），失败静默降级（显示创作者 ID）。
// 后端：GET /api/account/user-brief?ids=1,2,3（公开只读，只返回昵称/头像）。
// ============================================================================

import { useEffect, useRef, useState } from 'react';

export function useAuthorNames(
  ids: Array<number | string | null | undefined>,
): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const fetchedRef = useRef('');

  const key = [...new Set(ids.filter((v) => v !== null && v !== undefined && String(v) !== '').map(String))]
    .sort()
    .join(',');

  useEffect(() => {
    if (!key || fetchedRef.current === key) return;
    fetchedRef.current = key;

    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/account/user-brief?ids=${encodeURIComponent(key)}`, {
          signal: ctrl.signal,
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { users?: Array<{ id: number; nickname: string }> };
        if (Array.isArray(data.users) && data.users.length > 0) {
          const map: Record<string, string> = {};
          for (const u of data.users) {
            map[String(u.id)] = u.nickname || `创作者 ${u.id}`;
          }
          setNames(map);
        }
      } catch {
        /* 静默降级：页面继续显示「创作者 {id}」 */
      }
    })();

    return () => ctrl.abort();
  }, [key]);

  return names;
}
