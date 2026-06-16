"use client";

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
        const mockTranslations: Record<string, string> = {
          'zh-en': 'Hello, this is a demo translation',
          'en-zh': '你好，这是一个演示翻译',
        };
        const key = `${sourceLang}-${targetLang}`;
        setTranslatedText(mockTranslations[key] || `[翻译结果] ${sourceText}`);
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
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
              <span className="text-white text-xl">🌐</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">全球雅集翻译</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">AI 智能翻译 · 多语言支持</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                {/* Source Language */}
                <div className="p-6 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <select
                      value={sourceLang}
                      onChange={(e) => setSourceLang(e.target.value)}
                      className="text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 font-medium"
                    >
                      {LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {sourceText.length} 字符
                    </span>
                  </div>
                  <textarea
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    placeholder="输入要翻译的文本..."
                    rows={8}
                    className="w-full bg-transparent text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none text-lg"
                  />
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => setSourceText('')}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                    >
                      清空
                    </button>
                  </div>
                </div>

                {/* Swap Button */}
                <div className="hidden md:flex absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                  <button
                    onClick={swapLanguages}
                    className="p-3 rounded-full bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 shadow-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all"
                  >
                    <ArrowsRightLeftIcon className="w-5 h-5 text-green-500" />
                  </button>
                </div>

                {/* Target Language */}
                <div className="p-6 bg-gray-50 dark:bg-gray-900/50">
                  <div className="flex items-center justify-between mb-4">
                    <select
                      value={targetLang}
                      onChange={(e) => setTargetLang(e.target.value)}
                      className="text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 font-medium"
                    >
                      {LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </select>
                    {translatedText && (
                      <button
                        onClick={() => navigator.clipboard.writeText(translatedText)}
                        className="text-xs text-green-500 hover:text-green-600 transition-colors"
                      >
                        复制
                      </button>
                    )}
                  </div>
                  <div className="min-h-[192px]">
                    {isTranslating ? (
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-500"></div>
                        <span>翻译中...</span>
                      </div>
                    ) : translatedText ? (
                      <p className="text-gray-900 dark:text-white text-lg">{translatedText}</p>
                    ) : (
                      <p className="text-gray-400 dark:text-gray-500 text-lg">翻译结果...</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={translate}
                disabled={isTranslating || !sourceText.trim()}
                className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-md hover:shadow-lg"
              >
                {isTranslating ? '翻译中...' : '翻译'}
              </button>
              <button
                onClick={() => {
                  setSourceText('');
                  setTranslatedText('');
                }}
                className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
              >
                清空
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <select className="text-xs bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none">
                <option>Google Translate</option>
                <option>DeepL</option>
                <option>GPT-4</option>
              </select>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ✨ 支持 100+ 语言实时翻译
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}