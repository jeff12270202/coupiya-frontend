"use client"; 

import React, { useState } from 'react';

export default function AIChat() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (provider: 'deepseek' | 'pollinations') => {
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, prompt }),
      });
      const data = await res.json();
      setResponse(provider === 'deepseek' ? data.choices?.[0]?.message?.content : data.text);
    } catch (err) {
      setResponse('Error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <button onClick={() => handleSubmit('deepseek')}>Chat with DeepSeek</button>
      <button onClick={() => handleSubmit('pollinations')}>Chat with Pollinations</button>
      <div>{loading ? 'Loading...' : response}</div>
    </div>
  );
}