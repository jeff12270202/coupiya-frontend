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
  PhotoIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

// ================================================================
// 类型定义
// ================================================================
interface Attachment {
  type: 'image' | 'document';
  base64?: string;     
  text?: string;         
  fileName: string;
  mimeType: string;
  previewUrl?: string;   
  uploading?: boolean;
  error?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
}

const MOCK_RESPONSES = [
  '你好！我是瓷韵 AI 助手，很高兴为您服务！我可以帮您推荐陶瓷饰品、解答产品问题。',
  '感谢您的咨询！这款陶瓷手链采用传统工艺制作，温润细腻，非常适合日常佩戴。',
  '关于这个问题，让我为您详细解答...我们的陶瓷饰品都经过严格质量检测。',
  '好的，我理解您的需求！让我为您推荐几款适合的陶瓷饰品。',
  '这是一个很好的问题！我们的产品支持全球配送，通常 3-7 天可以送达。',
  '瓷韵·灵境祝您购物愉快！有任何问题请随时告诉我。',
];

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';
const DOC_ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [size, setSize] = useState({ width: 520, height: 650 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我是瓷韵 AI 助手，很高兴为您服务！\n\n✨ 新功能：点击下方 📎 可以上传图片或文档，我能帮你分析图片内容、解读产品手册哦～',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('DeepSeek-R1');
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [settings, setSettings] = useState({
    enableWebSearch: true,
    enableImageAnalysis: true,
    enableVoiceInput: true,
  });

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // 滚动到底部
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ==========================================================================
  // 【核心修复 1】：为拖拽监听添加显式 return，解决 ts(7030) 报错
  // ==========================================================================
  const handleMouseMove = useCallback((e: MouseEvent) => {
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
  }, [isDragging, isResizing, dragStart, resizeStart, size]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
    return; // ✅ 修复：此处添加显式 return，解决截图中 128 行报错的问题
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  const handleDragStart = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('button')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({ x: e.clientX, y: e.clientY, w: size.width, h: size.height });
  };

  // ==========================================================================
  // 语音识别初始化
  // ==========================================================================
  useEffect(() => {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      console.warn('浏览器不支持语音识别');
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = navigator.language || 'zh-CN';

    recognitionRef.current.onresult = (event: any) => {
      const currentTranscript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setTranscript(currentTranscript);
      setInput(currentTranscript);
    };

    recognitionRef.current.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
      if (transcript.trim()) {
        handleSend();
      }
    };
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert('当前浏览器不支持语音功能，请使用 Chrome 或 Edge');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setTranscript('');
      setInput('');
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // ==========================================================================
  // 附件菜单点击外部关闭
  // ==========================================================================
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showAttachmentMenu &&
        attachmentMenuRef.current &&
        !attachmentMenuRef.current.contains(e.target as Node)
      ) {
        setShowAttachmentMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAttachmentMenu]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, 'image');
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleDocSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, 'document');
    if (docInputRef.current) docInputRef.current.value = '';
  };

  const handleFileUpload = async (file: File, category: 'image' | 'document') => {
    setShowAttachmentMenu(false);
    const tempAtt: Attachment = {
      type: category,
      fileName: file.name,
      mimeType: file.type,
      previewUrl: category === 'image' ? URL.createObjectURL(file) : undefined,
      uploading: true,
    };
    setAttachments((prev) => [...prev, { ...tempAtt }]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/ai/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.success) {
        setAttachments((prev) =>
          prev.map((att) =>
            att.fileName === file.name && att.uploading
              ? { ...att, base64: data.base64, text: data.text, uploading: false, error: undefined }
              : att
          )
        );
      } else {
        setAttachments((prev) =>
          prev.map((att) =>
            att.fileName === file.name && att.uploading
              ? { ...att, uploading: false, error: data.error || '上传失败' }
              : att
          )
        );
      }
    } catch (err) {
      setAttachments((prev) =>
        prev.map((att) =>
          att.fileName === file.name && att.uploading
            ? { ...att, uploading: false, error: '网络异常，上传失败' }
            : att
        )
      );
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    files.forEach((file) => {
      const isImage = file.type.startsWith('image/');
      const isDoc = file.type === 'application/pdf' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.type === 'text/plain';
      
      if (isImage) {
        handleFileUpload(file, 'image');
      } else if (isDoc) {
        handleFileUpload(file, 'document');
      } else {
        alert('暂不支持上传该类型的文件，仅支持图片、PDF、Word、TXT');
      }
    });
  };

  // ==========================================================================
  // 【核心修复 2】：确保所有代码路径都显式 return，解决 handleSend 的报错
  // ==========================================================================
  const handleSend = async () => {
    const hasReadyAttachments = attachments.some((a) => !a.uploading && !a.error);
    if ((!input.trim() && !hasReadyAttachments) || isLoading) return;

    const readyAttachments = attachments.filter((a) => !a.uploading && !a.error);
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input || '[发送了附件]',
      timestamp: new Date(),
      attachments: readyAttachments.length > 0 ? [...readyAttachments] : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAttachments([]); 
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input || '请分析我上传的内容',
          history: messages,
          model: selectedModel,
          attachments: readyAttachments.map((a) => ({
            type: a.type,
            base64: a.base64,
            text: a.text,
            fileName: a.fileName,
          })),
        }),
      });
      const data = await res.json();

      // ==============================================================
      // 【核心 Agent 闭环逻辑】：如果 AI 决定调用工具
      // ==============================================================
      if (data.is_tool_call && data.tool_calls && data.tool_calls.length > 0) {
        const toolCall = data.tool_calls[0];
        
        if (toolCall.function.name === 'web_search' && settings.enableWebSearch) {
          const args = JSON.parse(toolCall.function.arguments);
          const searchQuery = args.query;

          const tempAssistantMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `🔍 正在调用“全球实时搜索引擎”为您查找 **“${searchQuery}”** 的最新信息...`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, tempAssistantMsg]);

          const searchRes = await fetch('/api/ai/web-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: searchQuery }),
          });
          const searchData = await searchRes.json();

          const finalRes = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: `工具 'web_search' 执行完毕。以下是搜索结果摘要，请基于这个摘要回答用户问题：\n\n${searchData.results}`,
              history: messages, 
              model: selectedModel,
              attachments: [],
            }),
          });
          
          const finalData = await finalRes.json();
          const finalAssistantMsg: Message = {
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: finalData.reply || '（联网搜索后，AI 未能生成有效回复）',
            timestamp: new Date(),
          };
          setMessages((prev) => {
            const filtered = prev.filter(m => m.id !== tempAssistantMsg.id);
            return [...filtered, finalAssistantMsg];
          });
          setIsLoading(false);
          return; // ✅ 显式 return
        }
      }

      // 普通回复
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply ?? '抱歉，暂时无法回答。',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      return; // ✅ 显式 return

    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)] ?? '抱歉，出现了一些问题，请稍后重试。',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      return; // ✅ Catch 中显式 return，消除剩余黄色警告
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
    if (!isMinimized) setIsMaximized(false);
  };

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
    if (!isMaximized) setIsMinimized(false);
  };

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
      <div className="w-full h-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
        
        {/* ==================== 顶部栏 ==================== */}
        <div
          onMouseDown={handleDragStart}
          className="bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-3 flex items-center justify-between cursor-move select-none"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏺</span>
            <div>
              <h3 className="text-white font-bold">瓷韵 AI 助手</h3>
              <p className="text-rose-100 text-xs">在线 · 智能全球服务</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleMinimize} className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white">
              {isMinimized ? <ArrowUpTrayIcon className="w-4 h-4" /> : <ArrowDownTrayIcon className="w-4 h-4" />}
            </button>
            <button onClick={toggleMaximize} className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white">
              {isMaximized ? <MinusIcon className="w-4 h-4" /> : <ArrowsPointingOutIcon className="w-4 h-4" />}
            </button>
            <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ==================== 内容区域 ==================== */}
        {!isMinimized && (
          <>
            <div 
              className={`flex-1 overflow-y-auto p-4 bg-gradient-to-b from-rose-50/50 to-white dark:from-gray-900 dark:to-gray-800 relative ${isDraggingOver ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              {isDraggingOver && (
                <div className="absolute inset-0 z-10 bg-blue-500/10 border-4 border-dashed border-blue-400 rounded-lg flex items-center justify-center pointer-events-none">
                  <p className="text-blue-600 font-bold text-lg">📁 拖拽文件至此即可快速上传</p>
                </div>
              )}

              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-tr-sm'
                        : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-tl-sm shadow-md'
                    }`}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-white/20 pt-2">
                          {message.attachments.map((att, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs opacity-90">
                              {att.type === 'image' ? (
                                <>
                                  <PhotoIcon className="w-4 h-4 shrink-0" />
                                  {att.previewUrl && <img src={att.previewUrl} alt={att.fileName} className="w-10 h-10 rounded object-cover shrink-0" />}
                                </>
                              ) : (
                                <DocumentTextIcon className="w-4 h-4 shrink-0" />
                              )}
                              <span className="truncate">{att.fileName}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs opacity-70 mt-1">{message.timestamp.toLocaleTimeString()}</p>
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

            {/* ==================== 输入区域 ==================== */}
            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {attachments.map((att, index) => (
                    <div key={index} className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
                      att.error ? 'bg-red-50 border border-red-200 text-red-600' : 
                      att.uploading ? 'bg-amber-50 border border-amber-200 text-amber-600 animate-pulse' : 
                      'bg-rose-50 border border-rose-200 text-rose-600'
                    }`}>
                      {att.type === 'image' ? (att.previewUrl ? <img src={att.previewUrl} alt={att.fileName} className="w-8 h-8 rounded object-cover shrink-0" /> : <PhotoIcon className="w-4 h-4 shrink-0" />) : <DocumentTextIcon className="w-4 h-4 shrink-0" />}
                      <span className="max-w-[100px] truncate">{att.fileName}</span>
                      {att.uploading && <span className="text-amber-500"><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></span>}
                      {att.error && <span className="text-red-500" title={att.error}>⚠️</span>}
                      <button onClick={() => removeAttachment(index)} className="ml-1 hover:text-red-800"><XMarkIcon className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}

              <input ref={imageInputRef} type="file" accept={IMAGE_ACCEPT} onChange={handleImageSelect} className="hidden" />
              <input ref={docInputRef} type="file" accept={DOC_ACCEPT} onChange={handleDocSelect} className="hidden" />

              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 focus-within:border-rose-300 dark:focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-300 dark:focus-within:ring-rose-500 transition-all flex items-end">
                
                {/* 左侧工具栏 */}
                <div className="flex items-center gap-1 px-2 pb-2.5 pt-2">
                  <div className="relative" ref={attachmentMenuRef}>
                    <button onClick={() => setShowAttachmentMenu(!showAttachmentMenu)} className="p-1.5 text-gray-500 hover:text-rose-500 transition-colors rounded-full" title="添加附件">
                      <PaperClipIcon className="w-5 h-5" />
                    </button>
                    {showAttachmentMenu && (
                      <div className="absolute bottom-10 left-0 bg-white dark:bg-gray-700 rounded-xl shadow-xl border border-gray-200 dark:border-gray-600 py-1 w-44 z-50">
                        <button onClick={() => { imageInputRef.current?.click(); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-rose-50 transition-colors"><PhotoIcon className="w-5 h-5 text-rose-500" /><span>上传图片</span></button>
                        <button onClick={() => { docInputRef.current?.click(); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-rose-50 transition-colors"><DocumentTextIcon className="w-5 h-5 text-rose-500" /><span>上传文档</span></button>
                        <div className="border-t border-gray-100 my-1"></div>
                        <div className="px-4 py-1.5 text-[10px] text-gray-400">支持 JPG/PNG/PDF/DOCX/TXT</div>
                      </div>
                    )}
                  </div>
                  
                  <button onClick={toggleVoiceInput} className={`p-1.5 transition-colors rounded-full ${isListening ? 'text-red-500 animate-pulse' : 'text-gray-500 hover:text-rose-500'}`} title="语音输入">
                    <MicrophoneIcon className="w-5 h-5" />
                  </button>
                  
                  <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-1.5 text-gray-500 hover:text-rose-500 transition-colors rounded-full" title="智能体设置">
                    <Cog6ToothIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* 文本域 */}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="给 Assistant 发消息 (Enter 发送)"
                  rows={1}
                  className="flex-1 bg-transparent py-3 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none max-h-[150px]"
                />

                {/* 右侧控件 */}
                <div className="flex items-center gap-2 px-3 pb-2.5 pt-2">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="text-xs bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg px-2 py-1 text-gray-700 dark:text-gray-300 focus:outline-none"
                  >
                    <option>DeepSeek-R1</option>
                    <option>DeepSeek-V3</option>
                  </select>
                  <button
                    onClick={handleSend}
                    disabled={(!input.trim() && !attachments.some(a => !a.uploading && !a.error)) || isLoading}
                    className="p-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-lg hover:from-rose-600 hover:to-pink-600 disabled:opacity-50 transition-all shadow-md"
                  >
                    <PaperAirplaneIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {!isMaximized && (
              <div onMouseDown={handleResizeStart} className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-center justify-center text-gray-400 hover:text-rose-500">
                <div className="w-3 h-3 border-r-2 border-b-2 border-current rounded-br-sm"></div>
              </div>
            )}

            {/* ==================== 设置面板 ==================== */}
            {isSettingsOpen && (
              <div className="absolute right-4 top-14 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 z-50">
                <h4 className="font-semibold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                  <Cog6ToothIcon className="w-4 h-4" /> 智能体配置
                </h4>
                <div className="space-y-3">
                  <label className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <span className="flex items-center gap-2"><GlobeAltIcon className="w-4 h-4 text-rose-500" /> 联网搜索</span>
                    <input 
                      type="checkbox" 
                      checked={settings.enableWebSearch} 
                      onChange={(e) => setSettings({...settings, enableWebSearch: e.target.checked})}
                      className="w-4 h-4 text-rose-500 rounded focus:ring-rose-500"
                    />
                  </label>
                  <label className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <span className="flex items-center gap-2"><EyeIcon className="w-4 h-4 text-rose-500" /> 多模态视觉</span>
                    <input 
                      type="checkbox" 
                      checked={settings.enableImageAnalysis} 
                      onChange={(e) => setSettings({...settings, enableImageAnalysis: e.target.checked})}
                      className="w-4 h-4 text-rose-500 rounded focus:ring-rose-500"
                    />
                  </label>
                  <label className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <span className="flex items-center gap-2"><MicrophoneIcon className="w-4 h-4 text-rose-500" /> 语音输入</span>
                    <input 
                      type="checkbox" 
                      checked={settings.enableVoiceInput} 
                      onChange={(e) => setSettings({...settings, enableVoiceInput: e.target.checked})}
                      className="w-4 h-4 text-rose-500 rounded focus:ring-rose-500"
                    />
                  </label>
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-600 mt-2">
                    <p className="text-[10px] text-gray-400 leading-tight">
                      * 切换联网搜索后，将自动拦截 `web_search` 工具调用。<br/>
                      * 多模态大模型可分析图片与文档。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}