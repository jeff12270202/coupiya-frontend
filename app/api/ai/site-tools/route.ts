// ============================================================================
// app/api/ai/site-tools/route.ts —— Agent 工具执行器
// ----------------------------------------------------------------------------
//   GET  /api/ai/site-tools        工具清单 + 服务目录统计（前端用于展示能力面）
//   POST /api/ai/site-tools        执行一个【服务端】工具 { name, args }
//
// 为什么把服务端工具集中到一个入口：
//   浮窗的 Agent Loop 每轮可能要调好几个工具。如果每个工具一个路由，前端要维护
//   一张 URL 映射表，加工具就要改两处。集中分派后，新增工具 = 在 SITE_TOOLS 里
//   加一条 + 在这里加一个 case，前端零改动。
//
// 错误语义：任何工具失败都返回 200 + { ok:false, error }，不抛 5xx。
//   原因：工具失败是【对话的一部分】，模型需要读到失败原因并据此改口/换工具；
//   如果抛 5xx，整轮对话就断了，模型也没机会自愈。
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { SITE_SERVICES, searchCatalog } from '@/lib/site-catalog';
import { SITE_TOOLS, findTool } from '@/lib/site-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

function rid(): string {
  return crypto.randomUUID().slice(0, 8);
}

function log(level: 'info' | 'warn' | 'error', id: string, event: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'ai-site-tools', rid: id, event, ...extra });
  if (level === 'error') console.error(line);
  else console.log(line);
}

/* ---------------------------------------------------------------------------
 * GET —— 能力面
 * ------------------------------------------------------------------------- */
export async function GET() {
  return NextResponse.json({
    success: true,
    tools: SITE_TOOLS.map((t) => ({ name: t.name, label: t.label, executor: t.executor, description: t.description })),
    serverToolCount: SITE_TOOLS.filter((t) => t.executor === 'server').length,
    clientToolCount: SITE_TOOLS.filter((t) => t.executor === 'client').length,
    serviceCount: SITE_SERVICES.length,
    services: SITE_SERVICES.map((s) => ({ id: s.id, name: s.name, path: s.path, kind: s.kind, requiresAuth: !!s.requiresAuth })),
  });
}

/* ---------------------------------------------------------------------------
 * POST —— 分派
 * ------------------------------------------------------------------------- */
export async function POST(req: NextRequest) {
  const id = rid();

  let body: Record<string, unknown>;
  try {
    const parsed = (await req.json()) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('bad');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: '请求体必须是 JSON 对象' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  const args = (body.args && typeof body.args === 'object' ? body.args : {}) as Record<string, unknown>;
  const spec = findTool(name);
  if (!spec) return NextResponse.json({ ok: false, error: `未知工具：${name}` }, { status: 400 });
  if (spec.executor !== 'server') {
    return NextResponse.json({ ok: false, error: `工具 ${name} 是客户端工具，应在浏览器内执行` }, { status: 400 });
  }

  const origin = req.nextUrl.origin;

  try {
    switch (name) {
      /* ---------------- 站内服务检索 ---------------- */
      case 'site_search': {
        const q = String(args.query ?? '').trim();
        if (!q) return NextResponse.json({ ok: false, error: '缺少 query' });
        const hits = searchCatalog(q, Number(args.limit ?? 6));
        log('info', id, 'site_search', { q, hits: hits.length });
        if (hits.length === 0) {
          return NextResponse.json({
            ok: true,
            result: {
              query: q,
              found: 0,
              note: '站内服务目录中没有匹配项。请如实告知用户本站暂无此服务，不要编造。',
              allServiceNames: SITE_SERVICES.map((s) => s.name),
            },
          });
        }
        return NextResponse.json({
          ok: true,
          result: {
            query: q,
            found: hits.length,
            matches: hits.map((h) => ({
              name: h.service.name,
              kind: h.service.kind,
              path: h.service.path ?? null,
              api: h.service.api ?? null,
              summary: h.service.summary,
              actions: h.service.actions,
              requiresAuth: !!h.service.requiresAuth,
              whenToUse: h.service.whenToUse,
              matchedBecause: h.matched,
            })),
          },
        });
      }

      /* ---------------- 商品搜索（Saleor GraphQL） ---------------- */
      case 'search_product': {
        const keyword = String(args.keyword ?? '').trim();
        const first = Math.min(Math.max(Number(args.first ?? 5), 1), 12);
        const endpoint = process.env.NEXT_PUBLIC_SALEOR_API_URL ?? 'https://api.coupiya.com/saleor/graphql/';
        const channel = process.env.NEXT_PUBLIC_SALEOR_CHANNEL ?? 'default-channel';

        // ⚠️ 为什么不用 Saleor 的 filter:{search:…}：
        //    实测（2026-10）该实例上 filter.search 对中文【恒返回 0】——
        //    Saleor 底层是 PostgreSQL 全文检索，其分词配置无法切分中日韩文字
        //    （CJK 没有空格），所以"瓷""茶具"这类关键词一个都搜不到，
        //    而 totalCount 明明是 21。这不是我们写错了参数，是引擎的固有短板。
        //
        //    因此改为：取回该渠道的商品清单（本店规模只有几十件，取 100 条足够），
        //    在应用层做语言无关的匹配。规模上到几千件时，应换成带 CJK 分词
        //    的搜索引擎（如 Meilisearch / Elasticsearch + ik 分词器），而不是回退到
        //    Saleor 的 filter.search —— 那条路对中文永远是坏的。
        const query = `query AgentProducts($channel: String!, $first: Int!) {
          products(first: $first, channel: $channel) {
            totalCount
            edges { node { id name slug } }
          }
        }`;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { channel, first: 100 } }),
          signal: AbortSignal.timeout(20_000),
        });
        const json = (await res.json().catch(() => ({}))) as {
          data?: { products?: { totalCount?: number; edges?: Array<{ node: { id: string; name: string; slug: string } }> } };
          errors?: Array<{ message?: string }>;
        };

        if (!res.ok || json.errors?.length) {
          const detail = json.errors?.[0]?.message ?? `HTTP ${res.status}`;
          log('warn', id, 'search_product_failed', { detail });
          return NextResponse.json({
            ok: true,
            result: { keyword, found: 0, note: `商品检索暂时不可用（${detail}）。请如实告知用户，不要编造商品。` },
          });
        }

        const all = (json.data?.products?.edges ?? []).map((e) => e.node);
        const totalCount = json.data?.products?.totalCount ?? all.length;

        /** 语言无关的商品名匹配打分 */
        const score = (name: string): number => {
          const n = name.toLowerCase();
          const q = keyword.toLowerCase();
          if (!q) return 1;
          if (n.includes(q)) return 100;
          let s = 0;
          // CJK 没有空格 → 2-gram 切片
          for (let i = 0; i + 2 <= q.length; i += 1) {
            if (n.includes(q.slice(i, i + 2))) s += 12;
          }
          // 拉丁语系 → 按空格分词
          for (const t of q.split(/\s+/).filter((t) => t.length >= 2)) {
            if (n.includes(t)) s += 20;
          }
          return s;
        };

        const matched = all
          .map((p) => ({ p, s: score(p.name) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, first)
          .map((x) => x.p);

        log('info', id, 'search_product', { keyword, catalogSize: totalCount, matched: matched.length });
        return NextResponse.json({
          ok: true,
          result: {
            keyword,
            found: matched.length,
            catalogSize: totalCount,
            products: matched.map((n) => ({ name: n.name, path: `/product/${n.slug || n.id}`, id: n.id })),
            note:
              matched.length === 0
                ? `店里共 ${totalCount} 件商品，没有匹配「${keyword}」的。可以建议用户换个关键词或去首页浏览全部。`
                : undefined,
          },
        });
      }

      /* ---------------- 博客搜索（WordPress REST） ---------------- */
      case 'search_blog': {
        const q = String(args.query ?? '').trim();
        if (!q) return NextResponse.json({ ok: false, error: '缺少 query' });
        const perPage = Math.min(Math.max(Number(args.per_page ?? 5), 1), 10);
        const base = (process.env.NEXT_PUBLIC_WP_REST_URL ?? 'https://api.coupiya.com/wordpress/wp-json/wp/v2').replace(/\/+$/, '');
        const url = `${base}/posts?search=${encodeURIComponent(q)}&per_page=${perPage}&_fields=id,title,excerpt,link,date`;

        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) {
          log('warn', id, 'search_blog_failed', { status: res.status });
          return NextResponse.json({
            ok: true,
            result: { query: q, found: 0, note: `博客检索暂时不可用（HTTP ${res.status}）。请如实告知。` },
          });
        }
        const posts = (await res.json().catch(() => [])) as Array<{
          id: number;
          link: string;
          date: string;
          title?: { rendered?: string };
          excerpt?: { rendered?: string };
        }>;
        const list = Array.isArray(posts) ? posts : [];
        log('info', id, 'search_blog', { q, found: list.length });
        return NextResponse.json({
          ok: true,
          result: {
            query: q,
            found: list.length,
            posts: list.map((p) => ({
              title: (p.title?.rendered ?? '').replace(/<[^>]+>/g, '').slice(0, 80),
              excerpt: (p.excerpt?.rendered ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120),
              link: p.link,
              date: p.date,
            })),
            note: list.length === 0 ? '没有匹配的文章。可以建议用户去灵感日志首页浏览。' : undefined,
          },
        });
      }

      /* ---------------- 我的账户 ---------------- */
      case 'get_my_account': {
        let user: { id: number } | null = null;
        try {
          const session = await import('@/lib/session');
          user = await session.getSessionUser(req);
        } catch {
          /* 未登录 */
        }
        if (!user) {
          log('info', id, 'get_my_account_anon');
          return NextResponse.json({
            ok: true,
            result: {
              loggedIn: false,
              note: '用户尚未登录。请先调用 open_face_login 引导刷脸登录，不要编造余额或订单数据。',
            },
          });
        }
        const ledger = await import('@/lib/ledger');
        const u = await ledger.prisma.user.findUnique({
          where: { id: user.id },
          select: { id: true, nickname: true, balance: true, username: true },
        });
        const txns = await ledger.prisma.creditTransaction.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: { type: true, amount: true, balanceAfter: true, reason: true, createdAt: true },
        });
        log('info', id, 'get_my_account', { userId: user.id });
        return NextResponse.json({
          ok: true,
          result: {
            loggedIn: true,
            nickname: u?.nickname ?? null,
            username: u?.username ?? null,
            balance: u?.balance ?? 0,
            recentTransactions: txns.map((t: any) => ({
              type: t.type,
              amount: t.amount,
              balanceAfter: t.balanceAfter,
              reason: t.reason,
              at: t.createdAt.toISOString(),
            })),
          },
        });
      }

      /* ---------------- 翻译（复用既有路由） ---------------- */
      case 'translate_text': {
        const text = String(args.text ?? '').trim().slice(0, 4000);
        if (!text) return NextResponse.json({ ok: false, error: '缺少 text' });
        const res = await fetch(new URL('/api/ai/translate', origin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            targetLang: String(args.target_lang ?? '英文'),
            sourceLang: args.source_lang ? String(args.source_lang) : undefined,
          }),
          signal: AbortSignal.timeout(40_000),
        });
        const json = (await res.json().catch(() => ({}))) as { translated_text?: string; success?: boolean };
        log('info', id, 'translate_text', { ok: res.ok && !!json.translated_text });
        return NextResponse.json({
          ok: res.ok && !!json.translated_text,
          result: json.translated_text ? { translation: json.translated_text, target: args.target_lang ?? '英文' } : undefined,
          error: res.ok ? '翻译服务未返回结果' : `翻译失败（HTTP ${res.status}）`,
        });
      }

      /* ---------------- 联网搜索（复用既有路由） ---------------- */
      case 'web_search': {
        const q = String(args.query ?? '').trim();
        if (!q) return NextResponse.json({ ok: false, error: '缺少 query' });
        const res = await fetch(new URL('/api/ai/web-search', origin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
          signal: AbortSignal.timeout(30_000),
        });
        const json = (await res.json().catch(() => ({}))) as { results?: string };
        log('info', id, 'web_search', { q, ok: res.ok });
        return NextResponse.json({
          ok: res.ok && !!json.results,
          result: json.results ? { query: q, results: String(json.results).slice(0, 4000) } : undefined,
          error: res.ok ? '搜索未返回结果' : `搜索失败（HTTP ${res.status}）`,
        });
      }

      default:
        return NextResponse.json({ ok: false, error: `工具 ${name} 尚未实现` }, { status: 501 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知错误';
    log('error', id, 'tool_threw', { name, error: msg });
    // 仍然返回 200：让模型读到失败原因并能改口，而不是把整轮对话打断
    return NextResponse.json({ ok: false, error: `工具 ${name} 执行异常：${msg}` });
  }
}
