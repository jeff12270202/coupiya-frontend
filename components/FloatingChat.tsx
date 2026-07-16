'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  PaperAirplaneIcon,
  MinusIcon,
  XMarkIcon,
  ArrowsPointingOutIcon,
  PaperClipIcon,
  MicrophoneIcon,
  Cog6ToothIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const MOCK_RESPONSES = [
  '你好！我是瓷韵 AI 助手，很高兴为您服务！我可以帮您推荐陶瓷饰品、解答产品问题。',
  '感谢您的咨询！这款陶瓷手链采用传统工艺制作，温润细腻，非常适合日常佩戴。',
  '关于这个问题，让我为您详细解答...我们的陶瓷饰品都经过严格质量检测。',
  '好的，我理解您的需求！让我为您推荐几款适合的陶瓷饰品。',
  '这是一个很好的问题！我们的产品支持全球配送，通常 3-7 天可以送达。',
  '瓷韵·灵境祝您购物愉快！有任何问题请随时告诉我。',
];

export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [size, setSize] = useState({ width: 500, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我是瓷韵 AI 助手，很高兴为您服务！',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('DeepSeek-R1');
  const [isLoading, setIsLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 滚动到底部
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // 处理鼠标移动
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setPosition((prev) => ({
          x: Math.max(0, Math.min(window.innerWidth - size.width, prev.x + dx)),
          y: Math.max(0, Math.min(window.innerHeight - size.height, prev.y + dy)),
        }));
        setDragStart({ x: e.clientX, y: e.clientY });
      }
      if (isResizing) {
        const dx = e.clientX - resizeStart.x;
        const dy = e.clientY - resizeStart.y;
        setSize({
          width: Math.max(350, resizeStart.w + dx),
          height: Math.max(300, resizeStart.h + dy),
        });
      }
    },
    [isDragging, isResizing, dragStart, resizeStart, size.width, size.height]
  );

  // 处理鼠标抬起
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  // 添加事件监听
  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
    return undefined;
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  // 开始拖动
  const handleDragStart = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('button')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  // 开始调整大小
  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({ x: e.clientX, y: e.clientY, w: size.width, h: size.height });
  };

  // 发送消息
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, history: messages, model: selectedModel }),
      });
      const data = await res.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply ?? MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)] ?? '抱歉，出现了一些问题，请稍后重试。',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理回车发送
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 最小化/最大化
  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
    if (!isMinimized) setIsMaximized(false);
  };

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
    if (!isMaximized) setIsMinimized(false);
  };

  // 如果关闭了
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-rose-500 to-pink-500 rounded-full shadow-2xl flex items-center justify-center text-white hover:scale-110 transition-all z-50"
      >
        <span className="text-2xl">💬</span>
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed z-50"
      style={{
        left: isMaximized ? 0 : position.x,
        top: isMaximized ? 0 : position.y,
        width: isMaximized ? '100vw' : size.width,
        height: isMaximized ? '100vh' : (isMinimized ? 'auto' : size.height),
        transition: isDragging || isResizing ? 'none' : 'left 0.2s, top 0.2s, width 0.2s, height 0.2s',
      }}
    >
      {/* 对话框容器 */}
      <div className="w-full h-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* 顶部栏 - 可拖动 */}
        <div
          onMouseDown={handleDragStart}
          className="bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-3 flex items-center justify-between cursor-move select-none"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏺</span>
            <div>
              <h3 className="text-white font-bold">瓷韵 AI 助手</h3>
              <p className="text-rose-100 text-xs">在线 · 为您服务</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMinimize}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
            >
              {isMinimized ? <ArrowUpTrayIcon className="w-4 h-4" /> : <ArrowDownTrayIcon className="w-4 h-4" />}
            </button>
            <button
              onClick={toggleMaximize}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
            >
              {isMaximized ? <MinusIcon className="w-4 h-4" /> : <ArrowsPointingOutIcon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 内容区域 */}
        {!isMinimized && (
          <>
            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-b from-rose-50/50 to-white dark:from-gray-900 dark:to-gray-800">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-tr-sm'
                          : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-tl-sm shadow-md'
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{message.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-gray-700 rounded-2xl px-4 py-3 rounded-tl-sm shadow-md">
                      <div className="flex gap-2">
                        <span className="w-2 h-2 bg-rose-400 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                        <span className="w-2 h-2 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* 输入区域 */}
            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <div className="relative bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 focus-within:border-rose-300 dark:focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-300 dark:focus-within:ring-rose-500 transition-all">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="给 Assistant 发消息 (Enter 发送)"
                  rows={1}
                  className="w-full bg-transparent px-4 py-3 pr-32 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none"
                  style={{ maxHeight: '120px' }}
                />

                {/* 工具栏 */}
                <div className="absolute bottom-2 left-2 flex items-center gap-1">
                  <button className="p-2 text-gray-500 dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors">
                    <PaperClipIcon className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-gray-500 dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors">
                    <MicrophoneIcon className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-gray-500 dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors">
                    <Cog6ToothIcon className="w-4 h-4" />
                  </button>
                </div>

                {/* 右侧控件 */}
                <div className="absolute bottom-2 right-2 flex items-center gap-2">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="text-xs bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none"
                  >
                    <option>DeepSeek-R1</option>
                    <option>DeepSeek-V3</option>
                  </select>
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="p-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-lg hover:from-rose-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
                  >
                    <PaperAirplaneIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* 右下角调整大小手柄 */}
            {!isMaximized && (
              <div
                onMouseDown={handleResizeStart}
                className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-center justify-center text-gray-400 hover:text-rose-500"
              >
                <div className="w-3 h-3 border-r-2 border-b-2 border-current rounded-br-sm"></div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}