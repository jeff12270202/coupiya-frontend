interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// 如果前端和 Vercel 同源，直接使用相对路径，让 Vercel 的 rewrites 生效
export const aiAPI = {
  chat: async (message: string, history?: ChatMessage[]) => {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
    if (!res.ok) throw new Error(`Chat API error: ${res.status}`);
    return res.json();
  },

  // 注意：这里对应你的 /api/ai/generate-image 路由
  generate: async (prompt: string, style?: string) => {
    const res = await fetch('/api/ai/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, style, width: 512, height: 512 }),
    });
    if (!res.ok) throw new Error(`Generate API error: ${res.status}`);
    return res.json();
  },

  translate: async (text: string, sourceLang: string, targetLang: string) => {
    const res = await fetch('/api/ai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source_lang: sourceLang, target_lang: targetLang }),
    });
    if (!res.ok) throw new Error(`Translate API error: ${res.status}`);
    return res.json();
  },

  recommend: async (userId: string = 'anonymous') => {
    const res = await fetch('/api/ai/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) throw new Error(`Recommend API error: ${res.status}`);
    return res.json();
  },
};