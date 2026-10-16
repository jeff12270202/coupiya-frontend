// ============================================================================
// app/auth/callback/page.tsx —— 腾讯云人脸核身完成后的回跳页
// ----------------------------------------------------------------------------
// 由 lib/faceid.ts 的 DetectAuth 通过 RedirectUrl 参数指定
// （仅微信H5场景生效）。腾讯云核身后会带着流程标识跳到本页。
//
// 【为什么本页刻意不落库、不建号、不发会话】
//   发起核身的那个浏览器窗口（PC）正在轮询 /api/auth/face/result?ticket=...
//   并由它完成建号 + 签发会话。
//   若本页也去调结果接口，用户会在这里（很可能是手机浏览器）被建成账号并拿到
//   一个只属于手机的会话；而 PC 端再轮询时只会看到 exists（"请用密码登录"），
//   于是用户被卡住。因此本页只做状态提示，把"定局"留给原来的窗口。
// ============================================================================

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '人脸核身已完成 · Coupiya',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

/** 腾讯云在不同场景下带回的参数名不一致，这里兼容常见几种 */
function pickToken(sp: SearchParams): string {
  for (const key of ['token', 'bizToken', 'BizToken', 'biz_token']) {
    const v = sp[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v)) {
      const first = v[0];
      if (first && first.trim()) return first.trim();
    }
  }
  return '';
}

export default function AuthCallbackPage({ searchParams }: { searchParams: SearchParams }) {
  const token = pickToken(searchParams);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8 text-center">
        <div
          className={
            'mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full ' +
            (token ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400')
          }
          aria-hidden="true"
        >
          <span className="text-2xl leading-none">{token ? '✓' : '!'}</span>
        </div>

        <h1 className="text-xl font-semibold">
          {token ? '人脸核身已完成' : '未检测到核身标识'}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          {token
            ? '请回到刚才打开本页的那个电脑页面，系统会自动完成注册并继续下一步（设置登录密码）。'
            : '这个链接可能已过期，或者已经被打开过了。请回到原来的页面重新发起刷脸。'}
        </p>

        <p className="mt-4 text-xs text-neutral-500">
          {token ? '本页面现在可以关闭了。' : '如有疑问，请重新发起一次刷脸核身。'}
        </p>
      </div>
    </main>
  );
}
