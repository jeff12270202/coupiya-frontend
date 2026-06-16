"use client"; 

import React, { useState } from 'react';

export default function AIChat() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, history: [] }),
      });
      const data = await res.json();
      setResponse(data.reply || 'No response');
    } catch (err) {
      setResponse('Error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">AI 聊天</h1>
      <textarea 
        value={prompt} 
        onChange={(e) => setPrompt(e.target.value)} 
        className="w-full p-4 border rounded-lg mb-4"
        placeholder="输入你的问题..."
        rows={4}
      />
      <div className="flex gap-4 mb-6">
        <button 
          onClick={handleSubmit}
          className="px-6 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition"
        >
          发送消息
        </button>
      </div>
      <div className="bg-white p-4 rounded-lg shadow">
        {loading ? '加载中...' : response || '等待你的消息...'}
      </div>
    </div>
  );
}