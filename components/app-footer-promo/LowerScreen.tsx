'use client';

import { useState } from 'react';
import Link from 'next/link';

type AIType = 'art' | 'video' | 'anime';

export default function LowerScreen() {
  const [modalOpen, setModalOpen] = useState(false);
  const [aiType, setAiType] = useState<AIType | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');

  const handleOpen = (type: AIType) => {
    setAiType(type);
    setModalOpen(true);
    setResult(null);
    setPrompt('');
  };

  const executeAI = async () => {
    if (!aiType) return;
    setLoading(true);
    setResult(null);
    try {
      let apiUrl = '';
      if (aiType === 'art') {
        apiUrl = '/api/ai/generate-image';
      } else if (aiType === 'video') {
        apiUrl = '/api/ai/generate-video';
      } else if (aiType === 'anime') {
        apiUrl = '/api/ai/generate-anime';
      }

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, width: 512, height: 512 }), // 视频和动漫也可兼容统一参数
      });

      const data = await res.json();
      if (data.imageUrl) {
        setResult(data.imageUrl);
      } else if (data.videoUrl) {
        setResult(data.videoUrl);
      } else {
        setResult('生成失败，服务暂时无法响应');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setResult('错误：' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const services = [
    {
      type: 'art' as AIType,
      title: '🎨 AI 图片创生',
      desc: '使用 DeepSeek 优化提示词，极速生成高质量创意视觉艺术。',
      features: ['文生图、图生图', '顶尖 Stable Diffusion 支持', '多种艺术风格选择', '高清放大和细节增强'],
      action: '开始创作',
    },
    {
      type: 'video' as AIType,
      title: '🎥 AI 视频生成',
      desc: '将灵感瞬间转化为动态视频，制作电影级预告片或创意短片。',
      features: ['100+ 视频风格选择', 'Pollinations 快速响应', 'Replicate 强力兜底', '自动存储至全球 CDN'],
      action: '开始生成',
    },
    {
      type: 'anime' as AIType,
      title: '🤖 AI 动漫工坊',
      desc: '生成精美的二次元作品，自动转换为动漫绘画与番剧风格。',
      features: ['专属动漫微调模型', '多集番剧风格转化', '深度构图与光影控制', 'AI 智能润色提示词'],
      action: '开始动漫',
    },
  ];

  return (
    <div>
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
          AI 娱乐创作中心 · 全球顶级工坊
        </h1>
        <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
          释放你的创造力！使用 DeepSeek 智能语义 + Pollinations 极速生成，体验无延迟的顶级 AI 创作。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {services.map((s) => (
          <div key={s.type} className="border rounded-2xl p-6 bg-white shadow-md hover:shadow-xl transition-all duration-300">
            <h2 className="text-2xl font-bold mb-2">{s.title}</h2>
            <p className="text-gray-600 mb-4">{s.desc}</p>
            <ul className="space-y-1 text-sm text-gray-500 mb-6">
              {s.features.map((f, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleOpen(s.type)}
              className="mt-2 w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition"
            >
              {s.action}
            </button>
          </div>
        ))}
      </div>

      {/* AI 模态框 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-bold">{services.find(s => s.type === aiType)?.title}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">输入描述词 / 提示词</label>
              <textarea
                className="w-full border rounded-lg p-2"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：一只赛博朋克风格的陶瓷动漫猫，在月球上发光的陶瓷首饰"
              />
            </div>
            <button
              onClick={executeAI}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'AI 正在调用多级模型生成中...' : '开始生成'}
            </button>
            {result && (
              <div className="mt-6 border-t pt-4">
                <h4 className="font-semibold mb-2">生成结果：</h4>
                {aiType === 'art' && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={result} alt="生成的图片" className="rounded-lg max-w-full" />
                )}
                {(aiType === 'video' || aiType === 'anime') && (
                  <video controls src={result} className="w-full rounded-lg" />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 底部数据监控 & 社交分享区块 */}
      <div className="mt-16 grid md:grid-cols-2 gap-8 border-t pt-10">
        <div className="bg-gray-50 p-6 rounded-xl">
          <h3 className="text-xl font-semibold mb-3">📊 数据分析与监控</h3>
          <p className="text-gray-600 mb-4">实时监控系统性能、用户行为分析和内容效果追踪。</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="bg-white px-3 py-1 rounded-full shadow">实时数据仪表板</span>
            <span className="bg-white px-3 py-1 rounded-full shadow">用户行为热图分析</span>
            <span className="bg-white px-3 py-1 rounded-full shadow">性能监控和告警</span>
            <span className="bg-white px-3 py-1 rounded-full shadow">自定义报告生成</span>
          </div>
          <button className="mt-5 text-purple-600 font-medium">查看数据 →</button>
        </div>
        <div className="bg-gray-50 p-6 rounded-xl">
          <h3 className="text-xl font-semibold mb-3">🌐 社交分享与连接</h3>
          <p className="text-gray-600 mb-4">一键分享你的创作到全球社交平台，连接创作者社区，发现更多灵感。</p>
          <div className="space-y-2">
            <a href="#" className="block text-blue-600 hover:underline">分享到社交网络</a>
            <a href="#" className="block text-blue-600 hover:underline">发布到创作社区</a>
            <a href="#" className="block text-blue-600 hover:underline">加入创作者社群</a>
          </div>
        </div>
      </div>
      <div className="text-center text-gray-400 text-sm mt-8">
        © 2025 AI娱乐创作中心 | 跨境电商生态娱乐系统 |{' '}
        <Link href="/" className="underline">
          返回主页
        </Link>
      </div>
    </div>
  );
}