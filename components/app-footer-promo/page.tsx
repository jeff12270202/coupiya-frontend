'use client';

import { useState } from 'react';
import Link from 'next/link';

type AIType = 'art' | 'writing' | 'music';

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
      if (aiType === 'art') {
        const res = await fetch('/api/ai/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });
        const data = await res.json();
        if (data.imageUrl) {
          setResult(data.imageUrl);
        } else {
          setResult('生成失败，请重试');
        }
      } else if (aiType === 'writing') {
        const res = await fetch('/api/ai/generate-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });
        const data = await res.json();
        setResult(data.text || '无响应');
      } else if (aiType === 'music') {
        const res = await fetch('/api/ai/text-to-speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: prompt }),
        });
        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        setResult(audioUrl);
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
      title: '🎨 AI 艺术工作室',
      desc: '使用最先进的AI图像生成模型，将你的想法转化为惊人的视觉艺术。',
      features: ['文生图、图生图、图像修复', '多种艺术风格选择', '高清放大和细节增强', '特效滤镜和风格迁移'],
      action: '进入工作室',
    },
    {
      type: 'writing' as AIType,
      title: '✍️ AI 写作助手',
      desc: '智能文案生成、内容优化、多语言翻译，提升你的写作效率。',
      features: ['创意文案自动生成', '语法检查和优化建议', '多语言实时翻译', '内容风格适配'],
      action: '开始写作',
    },
    {
      type: 'music' as AIType,
      title: '🎵 AI 音乐与语音',
      desc: '文本转语音、语音克隆、背景音乐生成，为你的内容添加完美声音。',
      features: ['100+语音风格选择', '语音情感控制调节', '背景音乐智能生成', '多语言语音支持'],
      action: '体验语音',
    },
  ];

  return (
    <div>
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
          AI 娱乐创作中心 · 下屏系统
        </h1>
        <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
          释放你的创造力！使用AI工具生成内容、编辑媒体，享受购物之外的娱乐体验。
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
              <label className="block text-sm font-medium mb-1">输入提示词 / 内容</label>
              <textarea
                className="w-full border rounded-lg p-2"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：一只猫在月球上钓鱼，赛博朋克风格"
              />
            </div>
            <button
              onClick={executeAI}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '生成中...' : '开始生成'}
            </button>
            {result && (
              <div className="mt-6 border-t pt-4">
                <h4 className="font-semibold mb-2">生成结果：</h4>
                {aiType === 'art' && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={result} alt="生成的图片" className="rounded-lg max-w-full" />
                )}
                {aiType === 'music' && result.startsWith('blob:') && (
                  <audio controls src={result} className="w-full" />
                )}
                {aiType === 'writing' && typeof result === 'string' && (
                  <div className="bg-gray-100 p-3 rounded-lg whitespace-pre-wrap">{result}</div>
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
        © 2024 AI娱乐创作中心 | 跨境电商生态娱乐系统 |{' '}
        <Link href="/" className="underline">
          切换到上屏系统
        </Link>
      </div>
    </div>
  );
}