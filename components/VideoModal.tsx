"use client";

import { useState } from 'react';
import {
  XMarkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  GlobeAltIcon,
  CloudArrowUpIcon,
  FilmIcon,
  RocketLaunchIcon,
  SparklesIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';

// ======================== 类型 ========================
type PipelineStage = 'idle' | 'generating' | 'publishing' | 'done' | 'error';

interface PublishResult {
  postId: number;
  fileId: string;
  playUrl: string;
  postLink: string;
}

// ======================== 流水线步骤 ========================
const PIPELINE_STEPS = [
  { key: 'optimize', label: 'DeepSeek 优化提示词', icon: <SparklesIcon className="w-5 h-5" /> },
  { key: 'generate', label: 'AI 模型生成视频', icon: <FilmIcon className="w-5 h-5" /> },
  { key: 'vod',      label: '腾讯云 VOD 全球转码', icon: <CloudArrowUpIcon className="w-5 h-5" /> },
  { key: 'publish',  label: '自动发布到 WordPress', icon: <RocketLaunchIcon className="w-5 h-5" /> },
  { key: 'cdn',      label: '全球 CDN 极速分发', icon: <GlobeAltIcon className="w-5 h-5" /> },
];

function PipelineProgress({ stepStatuses }: { stepStatuses: string[] }) {
  return (
    <div className="space-y-3">
      {PIPELINE_STEPS.map((step, idx) => {
        const status = stepStatuses[idx] || 'pending';
        return (
          <div key={step.key} className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
              status === 'done' ? 'bg-green-500 text-white shadow-md shadow-green-200' :
              status === 'active' ? 'bg-blue-500 text-white animate-pulse shadow-md shadow-blue-200' :
              status === 'error' ? 'bg-red-500 text-white' :
              'bg-gray-200 text-gray-400'
            }`}>
              {status === 'done' ? <CheckCircleIcon className="w-5 h-5" /> : step.icon}
            </div>
            <span className={`text-sm transition-colors duration-300 ${
              status === 'done' ? 'text-green-700 font-medium' :
              status === 'active' ? 'text-blue-700 font-semibold' :
              status === 'error' ? 'text-red-600' : 'text-gray-400'
            }`}>
              {step.label}{status === 'active' && <span className="ml-1 inline-block animate-pulse">...</span>}
            </span>
            {idx < PIPELINE_STEPS.length - 1 && (
              <div className={`ml-3 w-0.5 h-4 transition-colors duration-500 ${status === 'done' ? 'bg-green-300' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ======================== 主组件 ========================
export default function VideoModal({ onClose }: { onClose: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<PipelineStage>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [activeStep, setActiveStep] = useState(-1);
  const [stepStatuses, setStepStatuses] = useState<string[]>(['pending','pending','pending','pending','pending']);

  const resetPipeline = () => {
    setStage('idle'); setVideoUrl(null); setPublishResult(null);
    setErrorMsg(''); setActiveStep(-1);
    setStepStatuses(['pending','pending','pending','pending','pending']);
  };

  const updateStep = (idx: number, status: string) => {
    setStepStatuses(prev => { const n = [...prev]; n[idx] = status; return n; });
    if (status === 'active') setActiveStep(idx);
  };

  const isRunning = stage === 'generating' || stage === 'publishing';

  // ======================== 🌐 全自动流水线 ========================
  const runFullPipeline = async () => {
    if (!prompt.trim() || isRunning) return;
    resetPipeline();
    setStage('generating');

    try {
      // 阶段 1：AI 生成视频
      updateStep(0, 'active');
      const genRes = await fetch('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const genData = await genRes.json();
      if (!genData.videoUrl) throw new Error(genData.message || '视频生成失败');
      updateStep(0, 'done'); updateStep(1, 'done');
      setVideoUrl(genData.videoUrl);

      // 阶段 2：发布到 VOD + WordPress
      setStage('publishing');
      updateStep(2, 'active');
      const pubRes = await fetch('/api/ai/publish-vod-movie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiVideoUrl: genData.videoUrl, movieTitle: prompt.trim() }),
      });
      const pubData = await pubRes.json();
      if (!pubData.success) throw new Error(pubData.error || '发布失败');
      updateStep(2, 'done'); updateStep(3, 'done'); updateStep(4, 'done');

      setPublishResult({
        postId: pubData.postId, fileId: pubData.fileId, playUrl: pubData.playUrl,
        postLink: `https://blog.coupiya.com/movie/${encodeURIComponent(prompt.trim().replace(/\s+/g, '-').toLowerCase())}/`,
      });
      setStage('done');
    } catch (err: any) {
      setErrorMsg(err?.message || String(err) || '未知错误');
      if (activeStep >= 0) updateStep(activeStep, 'error');
      setStage('error');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runFullPipeline(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 flex items-center justify-center shadow-lg">
              <span className="text-white text-xl">🎬</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {stage === 'done' ? '🎉 发布成功！' : 'AI 视频 · 一键生成并发布'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {stage === 'done' ? '您的电影已通过腾讯云 VOD 分发至全球 CDN' : 'DeepSeek 优化 → AI 生成 → 腾讯云转码 → 自动上架'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/80 dark:hover:bg-gray-700 rounded-full transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* 输入区 */}
            {(stage === 'idle' || stage === 'error' || stage === 'done') && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">🎥 描述你想要的视频画面</label>
                <textarea value={prompt}
                  onChange={(e) => { setPrompt(e.target.value); if (stage === 'done' || stage === 'error') resetPipeline(); }}
                  onKeyDown={handleKeyPress}
                  placeholder="例如：赛博朋克风格的未来都市，霓虹灯闪烁，飞行汽车穿梭于高楼之间"
                  rows={3} disabled={isRunning}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-3 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                <button onClick={runFullPipeline} disabled={isRunning || !prompt.trim()}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 text-white rounded-xl hover:from-blue-700 hover:via-cyan-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold text-lg shadow-lg hover:shadow-xl active:scale-[0.98]">
                  <RocketLaunchIcon className="w-6 h-6" /> 🚀 一键生成并全球发布
                </button>
              </div>
            </div>
            )}

            {/* 流水线进度 */}
            {isRunning && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                  <ArrowPathIcon className="w-4 h-4 animate-spin text-blue-500" />
                  {stage === 'generating' ? '🤖 AI 正在生成视频...' : '☁️ 正在发布到全球 CDN...'}
                </p>
                {/* ✅ 修复了这里，删除了多余的 activeStep={activeStep} */}
                <PipelineProgress stepStatuses={stepStatuses} />
              </div>
            )}

            {/* 成功卡片 */}
            {stage === 'done' && publishResult && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 rounded-xl border border-green-200 dark:border-green-800 p-6 shadow-lg">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircleIcon className="w-6 h-6 text-green-500" />
                  <h4 className="font-bold text-lg text-green-800 dark:text-green-300">🎬 发布成功！您的电影已上线</h4>
                </div>
                {videoUrl && (
                  <div className="relative rounded-xl overflow-hidden bg-black mb-4">
                    <video src={publishResult.playUrl || videoUrl} controls className="w-full max-h-[300px]" playsInline />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">电影 ID</p>
                    <p className="font-mono font-semibold text-gray-800 dark:text-gray-200">#{publishResult.postId}</p>
                  </div>
                  <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">腾讯云 FileId</p>
                    <p className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{publishResult.fileId}</p>
                  </div>
                </div>
                <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-3 mb-4">
                  <p className="text-gray-500 text-xs mb-1">CDN 播放地址</p>
                  <p className="font-mono text-xs text-blue-600 dark:text-blue-400 break-all">{publishResult.playUrl}</p>
                </div>
                <div className="flex gap-3">
                  <a href={publishResult.postLink} target="_blank" rel="noopener noreferrer"
                    className="flex-1 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all text-center font-medium text-sm flex items-center justify-center gap-2 shadow-md">
                    <LinkIcon className="w-4 h-4" /> 前往前台观看
                  </a>
                  <button onClick={resetPipeline}
                    className="flex-1 py-2.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all text-center font-medium text-sm flex items-center justify-center gap-2">
                    <SparklesIcon className="w-4 h-4" /> 再生成一部
                  </button>
                </div>
              </div>
            )}

            {/* 错误提示 */}
            {stage === 'error' && errorMsg && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <p className="font-semibold text-red-700 dark:text-red-300 mb-1">流水线中断</p>
                    <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
                    <p className="text-xs text-red-500 mt-2">请检查网络连接后重试，或修改提示词再次生成。</p>
                  </div>
                </div>
              </div>
            )}

            {/* 空闲时流水线说明 */}
            {stage === 'idle' && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">🌐 全球顶级 24 小时无休流水线</p>
                {/* ✅ 修复了这里，删除了多余的 activeStep={-1} */}
                <PipelineProgress stepStatuses={['pending','pending','pending','pending','pending']} />
                <p className="text-xs text-gray-400 mt-4 leading-relaxed">
                  输入描述词后点击"一键生成并全球发布"，系统将自动完成：AI 语义优化 → 视频生成 → 腾讯云 VOD 转码 → WordPress 自动上架 → 全球 CDN 分发，全程无需人工干预。
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="p-4 border-t dark:border-gray-700 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900 dark:to-gray-850">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isRunning ? '⏳ 流水线运行中，预计耗时 15-90 秒，请勿关闭窗口' :
               stage === 'done' ? '✅ 流水线执行完毕 · 电影已上架至全球 CDN' :
               '🎬 AI 生成 → 腾讯云 VOD → 自动发布 → 全球极速播放'}
            </p>
            {!isRunning && <span className="text-xs text-gray-400 flex items-center gap-1"><GlobeAltIcon className="w-3 h-3" /> 24h 无休</span>}
          </div>
        </div>
      </div>
    </div>
  );
}