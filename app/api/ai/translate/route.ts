import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text, source_lang, target_lang } = await req.json();
    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    // 1. 如果有 DeepSeek Key，尝试进行真实翻译
    if (deepseekKey) {
      try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${deepseekKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'deepseek-chat', // 使用 DeepSeek 模型
            messages: [
              {
                role: 'system',
                content: `你是一个专业的翻译助手。请将输入的文本从 ${source_lang || '自动检测'} 翻译成 ${target_lang || '英文'}。请只输出翻译结果，不要包含任何额外的解释、引号或标点。`
              },
              {
                role: 'user',
                content: text
              }
            ],
            max_tokens: 500,
            temperature: 0.3, // 翻译把温度调低，保证准确性
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const translatedText = data.choices?.[0]?.message?.content?.trim() || '';
          if (translatedText) {
            return NextResponse.json({
              translated_text: translatedText,
              success: true
            });
          }
        }
      } catch (deepseekError) {
        console.warn('DeepSeek Translate fell back due to:', deepseekError);
        // 如果 DeepSeek 失败，进入下面的 Mock 兜底
      }
    }

    // 2. 兜底方案：如果没配 Key 或 API 失败，返回之前的 Mock 字典
    const translations: Record<string, string> = {
      'zh-en': 'Hello, this is a demo translation',
      'en-zh': '你好，这是一个演示翻译',
      'zh-ja': 'こんにちは、これはデモ翻訳です',
      'ja-zh': '你好，这是一个演示翻译',
    };

    const key = `${source_lang || 'zh'}-${target_lang || 'en'}`;
    const translatedText = translations[key] || `[翻译结果] ${text}`;

    return NextResponse.json({
      translated_text: translatedText,
      success: true
    });
    
  } catch (error) {
    console.error('Translate API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    );
  }
}