import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text, source_lang, target_lang } = await req.json();

    // Mock 翻译响应
    const translations: Record<string, string> = {
      'zh-en': 'Hello, this is a demo translation',
      'en-zh': '你好，这是一个演示翻译',
      'zh-ja': 'こんにちは、これはデモ翻訳です',
      'ja-zh': '你好，这是一个演示翻译',
    };

    const key = `${source_lang}-${target_lang}`;
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
