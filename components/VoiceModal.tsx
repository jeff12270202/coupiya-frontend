'use client';

import { useState, useEffect, useRef } from 'react';
import { XMarkIcon, MicrophoneIcon, StopIcon } from '@heroicons/react/24/outline';

// 定义 Web Speech API 相关类型
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

// 扩展 Window 接口
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
          const text = event.results[0][0].transcript;
          setTranscript(text);
          processVoiceCommand(text);
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
      const response = await fetch('/api/ai/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, type: 'shopping' }),
      });

      if (response.ok) {
        const data = await response.json();
        setResponse(data.reply || data.message);
      } else {
        // Mock response for demo
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

  const exampleCommands = ['搜索连衣裙', '我的订单', '有什么优惠', '推荐商品', '帮我找手机'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center">
              <span className="text-white text-xl">🎙️</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">语音购物</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="text-center py-8">
          <div
            className={`w-32 h-32 mx-auto rounded-full flex items-center justify-center transition-all duration-300 ${
              isListening ? 'bg-red-500 animate-pulse scale-110' : 'bg-gradient-to-r from-orange-500 to-red-500'
            }`}
          >
            <MicrophoneIcon className="w-16 h-16 text-white" />
          </div>

          <p className="mt-4 text-gray-600 dark:text-gray-300">
            {isListening ? '正在聆听...' : '点击麦克风开始语音购物'}
          </p>

          {transcript && (
            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">你说：</p>
              <p className="text-gray-800 dark:text-white">{transcript}</p>
            </div>
          )}

          {response && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
              <p className="text-sm text-blue-600 dark:text-blue-400">助手回复：</p>
              <p className="text-gray-800 dark:text-white">{response}</p>
            </div>
          )}

          {isProcessing && (
            <div className="mt-4 flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600"></div>
            </div>
          )}

          <div className="mt-6 flex gap-3 justify-center">
            {!isListening ? (
              <button
                onClick={startListening}
                className="px-6 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-full hover:from-orange-700 hover:to-red-700 transition-colors"
              >
                开始说话
              </button>
            ) : (
              <button
                onClick={stopListening}
                className="px-6 py-2 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <StopIcon className="w-4 h-4" />
                停止
              </button>
            )}
          </div>

          <div className="mt-6">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">试试这样说：</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {exampleCommands.map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => setTranscript(cmd)}
                  className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}