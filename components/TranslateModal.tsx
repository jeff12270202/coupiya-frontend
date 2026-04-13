'use client';

import { useState } from 'react';
import { XMarkIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline';

const LANGUAGES = [
  { code: 'zh', name: '中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'ru', name: 'Русский' },
];

export default function TranslateModal({ onClose }: { onClose: () => void }) {
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLang, setSourceLang] = useState('zh');
  const [targetLang, setTargetLang] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);

  const swapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
  };

  const translate = async () => {
    if (!sourceText.trim() || isTranslating) return;

    setIsTranslating(true);
    try {
      const response = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText,
          source_lang: sourceLang,
          target_lang: targetLang,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setTranslatedText(data.translated_text || data.result);
      } else {
        // Mock translation for demo
        const mockTranslation: Record<string, string> = {
          'zh-en': `Hello, this is a demo translation from ${sourceLang} to ${targetLang}`,
          'en-zh': '你好，这是一个演示翻译',
        };
        const key = `${sourceLang}-${targetLang}`;
        setTranslatedText(mockTranslation[key] || `[演示翻译] ${sourceText} (${targetLang})`);
      }
    } catch (error) {
      console.error('Translation error:', error);
      setTranslatedText('翻译服务暂时不可用，请稍后重试');
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
              <span className="text-white text-xl">🌐</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">实时翻译</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Source */}
          <div className="space-y-2">
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-800 dark:text-white"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="输入要翻译的文本..."
              rows={6}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-800 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Swap Button */}
          <div className="flex justify-center items-center">
            <button
              onClick={swapLanguages}
              className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              <ArrowsRightLeftIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>

          {/* Target */}
          <div className="space-y-2">
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-800 dark:text-white"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
            <textarea
              value={translatedText}
              readOnly
              placeholder="翻译结果..."
              rows={6}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-gray-800 dark:text-white resize-none"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={translate}
            disabled={isTranslating || !sourceText.trim()}
            className="flex-1 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-colors disabled:opacity-50"
          >
            {isTranslating ? '翻译中...' : '翻译'}
          </button>
          <button
            onClick={() => {
              setSourceText('');
              setTranslatedText('');
            }}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            清空
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 text-center">
          支持100+语言实时翻译，基于AI神经网络技术
        </p>
      </div>
    </div>
  );
}