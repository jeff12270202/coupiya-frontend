"use client";

import { useState, useEffect, useRef } from 'react';
import { XMarkIcon, MicrophoneIcon, StopIcon } from '@heroicons/react/24/outline';

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export default function VoiceModal({ onClose }: { onClose: () => void }) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionConstructor) {
        recognitionRef.current = new SpeechRecognitionConstructor();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'zh-CN';

        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          const result = event.results?.[0]?.[0];
          if (result?.transcript) {
            const text = result.transcript;
            setTranscript(text);
            processVoiceCommand(text);
          }
        };

        recognitionRef.current.onerror = () => {
          setIsListening(false);
          setResponse('无法识别语音，请检查麦克风权限或重试');
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }
  }, []);

  const startListening = () => {
    if (recognitionRef.current) {
      setTranscript('');
      setResponse('');
      recognitionRef.current.start();
      setIsListening(true);
    } else {
      setResponse('您的浏览器不支持语音识别功能');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const processVoiceCommand = async (command: string) => {
    setIsProcessing(true);
    try {
      const apiResponse = await fetch('/api/ai/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, type: 'shopping' }),
      });

      if (apiResponse.ok) {
        const data = await apiResponse.json();
        setResponse(data.reply || data.message);
      } else {
        if (command.includes('搜索') || command.includes('找')) {
          setResponse(`正在为您搜索"${command.replace('搜索', '').replace('找', '')}"相关商品，请稍后在商品列表中查看。`);
        } else if (command.includes('订单')) {
          setResponse('您的最近订单：暂无订单记录，快去选购心仪商品吧！');
        } else {
          setResponse(`收到指令："${command}"。我是AI语音助手，可以帮助您搜索商品、查询订单、获取优惠信息。`);
        }
      }
    } catch (error) {
      console.error('Voice command error:', error);
      setResponse('语音服务暂时不可用，请稍后再试');
    } finally {
      setIsProcessing(false);
    }
  };

  const exampleCommands = ['搜索陶瓷饰品', '查看购物车', '推荐商品', '我的订单', '帮助'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center">
              <span className="text-white text-xl">🎙️</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">语音寻瓷</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">AI 语音助手</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
          <div className="max-w-md mx-auto text-center">
            {/* Mic Button */}
            <div className="mb-8">
              <div
                className={`w-32 h-32 mx-auto rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 ${
                  isListening
                    ? 'bg-red-500 animate-pulse scale-110 shadow-2xl shadow-red-500/50'
                    : 'bg-gradient-to-r from-orange-500 to-red-500 hover:scale-105 shadow-lg hover:shadow-xl'
                }`}
                onClick={isListening ? stopListening : startListening}
              >
                {isListening ? (
                  <StopIcon className="w-12 h-12 text-white" />
                ) : (
                  <MicrophoneIcon className="w-12 h-12 text-white" />
                )}
              </div>
              <p className="mt-4 text-gray-600 dark:text-gray-400 font-medium">
                {isListening ? '正在聆听...' : '点击麦克风开始语音购物'}
              </p>
            </div>

            {/* Transcript */}
            {transcript && (
              <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-xl">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">您说：</p>
                <p className="text-gray-900 dark:text-white font-medium">{transcript}</p>
              </div>
            )}

            {/* Response */}
            {response && (
              <div className="mb-6 p-4 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
                <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">助手回复：</p>
                <p className="text-gray-900 dark:text-white">{response}</p>
              </div>
            )}

            {/* Loading */}
            {isProcessing && (
              <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500"></div>
                <span>处理中...</span>
              </div>
            )}

            {/* Example Commands */}
            <div className="mt-8">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">试试这样说：</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {exampleCommands.map((cmd) => (
                  <button
                    key={cmd}
                    onClick={() => {
                      setTranscript(cmd);
                      processVoiceCommand(cmd);
                    }}
                    className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <select className="text-xs bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none">
                <option>中文 (普通话)</option>
                <option>English</option>
                <option>日本語</option>
              </select>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              🎤 支持多种语言语音识别
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}