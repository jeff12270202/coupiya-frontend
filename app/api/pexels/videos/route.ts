// ============================================================================
// app/api/pexels/videos/route.ts —— Pexels 视频流服务端代理
// ----------------------------------------------------------------------------
// 为什么需要它：原版把 PEXELS_API_KEY 直接写死在 blog/page.tsx 客户端代码里，
// 任何访问者都能在浏览器源码中看到并盗用该 Key。现在 Key 只存在于服务端。
//
// 职责：GET /api/pexels/videos?per_page=15 → 代理 Pexels popular 视频
//  - 服务端持有 Key；客户端只拿净化后的视频列表
//  - 每 IP 限流；10s 超时；内存缓存 5 分钟（热门视频无需实时）
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CFG = {
  pexelsApiKey: process.env.PEXELS_API_KEY ?? '',
  pexelsEndpoint: 'https://api.pexels.com/videos/popular',
  timeoutMs: 10_000,
  maxPerPage: 30,
  defaultPerPage: 15,
  cacheTtlMs: 5 * 60 * 1000, // 5 分钟

  rateLimit: {
    windowMs: 60_000,
    max: 60,
  },
};

interface PexelsVideo {
  id: number;
  url: string;
  image: string;
  video_files: Array<{ link: string; quality: string; width: number; height: number }>;
}

/* ---------- 工具 ---------- */

function makeRequestId(): string {
  return crypto.randomUUID();
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip') || 'unknown';
}

const rateBuckets = new Map<string, number[]>();
function rateLimitCheck(ip: string): boolean {
  const now = Date.now();
  const arr = (rateBuckets.get(ip) ?? []).filter((t) => now - t < CFG.rateLimit.windowMs);
  if (arr.length >= CFG.rateLimit.max) {
    rateBuckets.set(ip, arr);
    return false;
  }
  arr.push(now);
  rateBuckets.set(ip, arr);
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (v.length === 0 || now - (v[v.length - 1] ?? 0) > CFG.rateLimit.windowMs * 10) rateBuckets.delete(k);
    }
  }
  return true;
}

/* ---------- 缓存 ---------- */

const cache = new Map<string, { data: unknown; expiresAt: number }>();

function cacheGet(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key: string, data: unknown): void {
  if (cache.size >= 100) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { data, expiresAt: Date.now() + CFG.cacheTtlMs });
}

/* ---------- 主路由 ---------- */

export async function GET(req: NextRequest) {
  const requestId = makeRequestId();

  if (!rateLimitCheck(getClientIp(req))) {
    return NextResponse.json({ success: false, code: 'ERR_RATE_LIMITED', videos: [] }, { status: 429 });
  }
  if (!CFG.pexelsApiKey) {
    return NextResponse.json({ success: false, code: 'ERR_CONFIG', message: 'Pexels 未配置', videos: [] });
  }

  const perPage = Math.min(CFG.maxPerPage, Math.max(1, Number(req.nextUrl.searchParams.get('per_page')) || CFG.defaultPerPage));
  const cacheKey = `pexels:${perPage}`;

  const cached = cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json({ success: true, videos: cached, requestId });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CFG.timeoutMs);
  try {
    const res = await fetch(`${CFG.pexelsEndpoint}?per_page=${perPage}`, {
      headers: { Authorization: CFG.pexelsApiKey },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ success: false, code: 'ERR_PEXELS', message: '视频流服务暂不可用', videos: [] }, { status: 502 });
    }
    const data = (await res.json()) as { videos?: PexelsVideo[] };
    // 净化：只保留前端需要的字段（不含任何敏感信息）
    const videos = (data.videos ?? [])
      .filter((v) => Array.isArray(v.video_files) && v.video_files.length > 0)
      .map((v) => ({
        id: v.id,
        poster: v.image ?? '',
        files: v.video_files.map((f) => ({
          link: f.link,
          quality: f.quality ?? 'sd',
          width: f.width ?? 0,
          height: f.height ?? 0,
        })),
      }));

    cacheSet(cacheKey, videos);
    return NextResponse.json(
      { success: true, videos, requestId },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    );
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', svc: 'pexels', requestId, event: 'pexels_failed', error: (e as Error)?.message }));
    return NextResponse.json({ success: false, code: 'ERR_PEXELS', message: '视频流服务暂不可用', videos: [] }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
