export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.coupiya.com';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'; // 更严格的字面量类型
  content: string;
}

export const aiAPI = {
  chat: async (message: string, history?: ChatMessage[]) => {
    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
    return res.json();
  },
  generate: async (prompt: string, style?: string) => {
    const res = await fetch(`${API_BASE}/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, style, width: 512, height: 512 }),
    });
    return res.json();
  },
  translate: async (text: string, sourceLang: string, targetLang: string) => {
    const res = await fetch(`${API_BASE}/ai/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source_lang: sourceLang, target_lang: targetLang }),
    });
    return res.json();
  },
  recommend: async (userId: string = 'anonymous') => {
    const res = await fetch(`${API_BASE}/ai/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return res.json();
  },
};