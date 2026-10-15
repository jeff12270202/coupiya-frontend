'use client';

// ============================================================================
// components/satellite/DrivePanel.tsx —— 我的卫星云盘（Backblaze B2）
// ----------------------------------------------------------------------------
// 完整闭环：开通 → 直传 → 列目录 → 限时下载 / 分享 → 删除
//   · 直传：/api/b2/presign-upload 拿预签名 URL，浏览器 PUT 直传，不过我们服务器
//   · 列目录：/api/b2/objects（服务端用【用户自己的受限密钥】列举，前缀隔离）
//   · 倒计时：hideAt / expireAt 由服务端按 lib/b2.ts 的 LIFECYCLE 计算，
//             与真正写进 B2 桶的 lifecycleRules 同源，不存在"页面说的和实际不一样"
//   · 删除：/api/b2/objects?key=…（服务端先校验前缀，再执行）
//
// 诚实原则：任何一步失败都显示服务端返回的真实错误原文，不做"假装成功"。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ClockIcon,
  CloudArrowUpIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  LockClosedIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { AuthUser } from '@/hooks/useAuth';
import { BTN_PRIMARY } from './shared';

interface DriveObject {
  key: string;
  name: string;
  size: number;
  lastModified: string;
  hideAt: string;
  expireAt: string;
}

interface DriveState {
  onboarded: boolean;
  bucket?: string;
  keyPrefix?: string;
  objects?: DriveObject[];
  totalBytes?: number;
  lifecycle?: { hideAfterDays: number; deleteAfterHideDays: number };
}

const DAY = 24 * 60 * 60 * 1000;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtRemain(ms: number): string {
  if (ms <= 0) return '已到期';
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `剩 ${d} 天 ${h} 小时`;
  if (h > 0) return `剩 ${h} 小时 ${m} 分`;
  return `剩 ${m} 分`;
}

/** 每个文件的生命周期进度条：0% = 刚上传，100% = 已被删除 */
function LifecycleBar({ obj, totalDays }: { obj: DriveObject; totalDays: number }) {
  const now = Date.now();
  const upload = new Date(obj.lastModified).getTime();
  const expire = new Date(obj.expireAt).getTime();
  const hide = new Date(obj.hideAt).getTime();
  const pct = Math.min(100, Math.max(0, ((now - upload) / (expire - upload)) * 100));
  const hidden = now >= hide;
  const gone = now >= expire;
  const hidePct = Math.min(100, Math.max(0, ((hide - upload) / (expire - upload)) * 100));

  return (
    <div className="mt-2">
      <div className="relative h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${gone ? 'bg-red-500' : hidden ? 'bg-amber-500' : 'bg-teal-400'}`}
          style={{ width: `${pct}%` }}
        />
        {/* 隐藏分界线 */}
        <div className="absolute inset-y-0 w-px bg-white/40" style={{ left: `${hidePct}%` }} title="隐藏线" />
      </div>
      <p className={`text-[11px] mt-1 flex items-center gap-1 ${gone ? 'text-red-300' : hidden ? 'text-amber-300' : 'text-white/45'}`}>
        <ClockIcon className="w-3 h-3" />
        {gone
          ? `已超过 ${totalDays} 天，B2 生命周期已将其清理`
          : hidden
            ? `已进入隐藏阶段（不可下载）· ${fmtRemain(expire - now)} 后彻底删除`
            : `${fmtRemain(hide - now)} 后隐藏 · 共保留 ${totalDays} 天`}
      </p>
    </div>
  );
}

export default function DrivePanel({
  user,
  authLoading,
  onNeedLogin,
}: {
  user: AuthUser | null;
  authLoading: boolean;
  onNeedLogin: () => void;
}) {
  const [drive, setDrive] = useState<DriveState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const needsLogin = !authLoading && !user;

  /* ---- 状态 + 文件列表 ---- */
  const refresh = useCallback(async () => {
    if (!user) {
      setDrive(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const st = await fetch('/api/satellite/status', { cache: 'no-store' });
      const stData = (await st.json().catch(() => ({}))) as DriveState & { error?: string };
      if (!st.ok) throw new Error(stData.error || `HTTP ${st.status}`);
      if (!stData.onboarded) {
        setDrive({ onboarded: false });
        return;
      }
      const ob = await fetch('/api/b2/objects', { cache: 'no-store' });
      const obData = (await ob.json().catch(() => ({}))) as DriveState & { error?: string };
      if (!ob.ok) throw new Error(obData.error || `HTTP ${ob.status}`);
      setDrive({
        onboarded: true,
        bucket: obData.bucket ?? stData.bucket,
        keyPrefix: obData.keyPrefix ?? stData.keyPrefix,
        objects: obData.objects ?? [],
        totalBytes: obData.totalBytes ?? 0,
        lifecycle: obData.lifecycle,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /* ---- 开通 ---- */
  const handleOnboard = useCallback(async () => {
    setLoading(true);
    setError('');
    setWarn('');
    try {
      const res = await fetch('/api/satellite/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; warnings?: string[] };
      if (!res.ok) throw new Error(data.error || `开通失败（HTTP ${res.status}）`);
      if (Array.isArray(data.warnings)) setWarn(data.warnings.join(' '));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '开通失败');
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  /* ---- 直传 ---- */
  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadMsg('');
      setError('');
      try {
        const res = await fetch('/api/b2/presign-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name }),
        });
        const data = (await res.json().catch(() => ({}))) as { uploadUrl?: string; key?: string; error?: string };
        if (!res.ok || !data.uploadUrl || !data.key) {
          throw new Error(data.error || `获取上传地址失败（HTTP ${res.status}）`);
        }
        const put = await fetch(data.uploadUrl, { method: 'PUT', body: file });
        if (![200, 201, 204].includes(put.status)) {
          throw new Error(`直传失败（HTTP ${put.status}）—— 若刚开通，CORS 全球生效约需 10-15 分钟`);
        }
        setUploadMsg(`✅ 已上传：${file.name}（${fmtBytes(file.size)}）`);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : '上传失败');
      } finally {
        setUploading(false);
      }
    },
    [refresh],
  );

  /* ---- 限时下载 / 复制分享链接 ---- */
  const getDownloadUrl = useCallback(async (key: string): Promise<string> => {
    const res = await fetch(`/api/b2/presign-download?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    const data = (await res.json().catch(() => ({}))) as { downloadUrl?: string; error?: string };
    if (!res.ok || !data.downloadUrl) throw new Error(data.error || `获取下载链接失败（HTTP ${res.status}）`);
    return data.downloadUrl;
  }, []);

  const handleDownload = useCallback(
    async (key: string) => {
      setBusyKey(key);
      setError('');
      try {
        const url = await getDownloadUrl(key);
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (e) {
        setError(e instanceof Error ? e.message : '下载失败');
      } finally {
        setBusyKey('');
      }
    },
    [getDownloadUrl],
  );

  const handleShare = useCallback(
    async (key: string) => {
      setBusyKey(key);
      setError('');
      try {
        const url = await getDownloadUrl(key);
        await navigator.clipboard.writeText(url);
        setCopiedKey(key);
        window.setTimeout(() => setCopiedKey(''), 2500);
      } catch (e) {
        setError(e instanceof Error ? e.message : '生成分享链接失败');
      } finally {
        setBusyKey('');
      }
    },
    [getDownloadUrl],
  );

  /* ---- 删除 ---- */
  const handleDelete = useCallback(
    async (key: string) => {
      if (!window.confirm('确定删除该文件？B2 上会立即移除，不可恢复。')) return;
      setBusyKey(key);
      setError('');
      try {
        const res = await fetch(`/api/b2/objects?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || `删除失败（HTTP ${res.status}）`);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : '删除失败');
      } finally {
        setBusyKey('');
      }
    },
    [refresh],
  );

  const totalDays = (drive?.lifecycle?.hideAfterDays ?? 3) + (drive?.lifecycle?.deleteAfterHideDays ?? 3);

  return (
    <>
      <p className="text-white/60 text-sm mb-4">
        开通卫星服务 = 系统自动为您创建<b>专属私有存储桶 + 受限密钥</b>（前缀隔离，互不可见）；
        浏览器预签名直传不占用我们服务器带宽；生命周期<b>{totalDays} 天</b>后自动清理
        （前 {drive?.lifecycle?.hideAfterDays ?? 3} 天可下载，之后进入隐藏阶段再
        {drive?.lifecycle?.deleteAfterHideDays ?? 3} 天删除），成本透明。
      </p>

      {needsLogin ? (
        <button type="button" onClick={onNeedLogin} className={BTN_PRIMARY}>
          刷脸登录后开通我的卫星云盘
        </button>
      ) : loading && !drive ? (
        <p className="text-white/50 text-sm">正在查询开通状态…</p>
      ) : error && !drive ? (
        <div className="text-sm text-red-300">{error}</div>
      ) : !drive?.onboarded ? (
        <>
          <button type="button" onClick={() => void handleOnboard()} disabled={loading} className={BTN_PRIMARY}>
            {loading ? '正在为您创建专属 B2 桶…' : '🚀 开通卫星服务（自动配置 B2 桶 + 账户）'}
          </button>
          {error && <p className="text-sm text-red-300 mt-3">{error}</p>}
        </>
      ) : (
        <div className="space-y-4">
          {/* 桶信息 */}
          <div className="rounded-xl bg-black/20 border border-white/10 p-4 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span>✅ 已开通 · 专属桶：<code className="text-teal-300">{drive.bucket}</code></span>
              <button
                type="button"
                onClick={() => void refresh()}
                className="ml-auto text-xs text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
              </button>
            </p>
            <p className="text-white/50 mt-1 text-xs flex items-center gap-1.5">
              <LockClosedIcon className="w-3.5 h-3.5" />
              私有桶（allPrivate）· 前缀 {drive.keyPrefix} · 已用 {fmtBytes(drive.totalBytes ?? 0)} · CORS 限本站域名
            </p>
            {warn && <p className="text-amber-300/90 text-xs mt-2">⚠️ {warn}</p>}
          </div>

          {/* 上传 */}
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={fileRef}
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = '';
              }}
              className="text-sm text-white/80 file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-teal-500 file:text-white file:font-semibold hover:file:brightness-110"
            />
            {uploading && (
              <span className="text-sm text-white/60 inline-flex items-center gap-2">
                <CloudArrowUpIcon className="w-4 h-4 animate-pulse" /> 直传中…
              </span>
            )}
          </div>
          {uploadMsg && <p className="text-sm text-emerald-300">{uploadMsg}</p>}

          {error && (
            <div className="text-sm text-red-300 flex items-start gap-2">
              <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* 文件列表 */}
          <div>
            <p className="text-sm text-white/70 mb-2">
              云盘文件（{(drive.objects ?? []).length}）
            </p>
            {(drive.objects ?? []).length === 0 ? (
              <p className="text-xs text-white/40">还没有文件。上传后会自动出现在这里，并开始 {totalDays} 天倒计时。</p>
            ) : (
              <ul className="space-y-2">
                {(drive.objects ?? []).map((o) => (
                  <li key={o.key} className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm truncate">{o.name}</p>
                        <p className="text-[11px] text-white/40">
                          {fmtBytes(o.size)} · 上传于 {new Date(o.lastModified).toLocaleString('zh-CN')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          disabled={busyKey === o.key}
                          onClick={() => void handleDownload(o.key)}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs inline-flex items-center gap-1 disabled:opacity-50"
                          title="生成 1 小时有效的下载直链"
                        >
                          <ArrowDownTrayIcon className="w-3.5 h-3.5" /> 下载
                        </button>
                        <button
                          type="button"
                          disabled={busyKey === o.key}
                          onClick={() => void handleShare(o.key)}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs inline-flex items-center gap-1 disabled:opacity-50"
                          title="复制一条限时分享链接"
                        >
                          <LinkIcon className="w-3.5 h-3.5" />
                          {copiedKey === o.key ? '已复制' : '分享'}
                        </button>
                        <button
                          type="button"
                          disabled={busyKey === o.key}
                          onClick={() => void handleDelete(o.key)}
                          className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs text-red-200 inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          <TrashIcon className="w-3.5 h-3.5" /> 删除
                        </button>
                      </div>
                    </div>
                    <LifecycleBar obj={o} totalDays={totalDays} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
