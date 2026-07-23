'use client';

import { useState, useRef, useEffect } from 'react';
import {
  XMarkIcon,
  PaperAirplaneIcon,
  PaperClipIcon,
  PhotoIcon,
  DocumentTextIcon,
  MicrophoneIcon,
  Cog6ToothIcon,
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

export default function AIChatModal({ onClose }: { onClose: () => void }) {
  // ------------------ UI 状态 ------------------
  const [isDraggingOver, setIsDraggingOver] = useState(false); // 拖拽文件悬浮状态

  // ------------------ AI 与 数据状态 ------------------
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我是瓷韵 AI 助手，很高兴为您服务！\n\n✨ 新功能：点击 📎 上传图片或文档，我能帮你分析图片内容、解读产品手册哦～',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('DeepSeek-R1');
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // ------------------ 智能体高级设置 ------------------
  const [settings, setSettings] = useState({
    enableWebSearch: true,     // 开启联网搜索
    enableImageAnalysis: true, // 开启多模态分析
    enableVoiceInput: true,    // 开启语音输入
  });

  // ------------------ 语音状态 ------------------
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  // ------------------ Refs ------------------
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null); // 语音识别实例

  // ------------------ 滚动到底部 ------------------
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ------------------ 语音识别初始化 (Web Speech API) ------------------
  useEffect(() => {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      console.warn('浏览器不支持语音识别');
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    // 根据浏览器语言自动适应 (全球用户自适应)
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
      // 如果识别结束有内容，自动触发发送
      if (transcript.trim()) {
        sendMessage();
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

  // ------------------ 附件菜单点击外部关闭 ------------------
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showAttachmentMenu && attachmentMenuRef.current && !attachmentMenuRef.current.contains(e.target as Node)) {
        setShowAttachmentMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAttachmentMenu]);

  // ------------------ 文件上传处理 ------------------
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

  // ------------------ 🌟 拖拽文件核心逻辑 ------------------
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

  // ------------------ 🧠 终极 AI 智能体发送与闭环逻辑 ------------------
  const sendMessage = async () => {
    const hasReadyAtt = attachments.some(a => !a.uploading && !a.error);
    if ((!input.trim() && !hasReadyAtt) || isLoading) return;

    const readyAttachments = attachments.filter(a => !a.uploading && !a.error);
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
      // 第一轮：发起 AI 请求 (判断是否需要调用工具)
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input || '请分析我上传的内容',
          history: messages,
          model: selectedModel,
          attachments: readyAttachments.map(a => ({ type: a.type, base64: a.base64, text: a.text, fileName: a.fileName })),
        }),
      });
      const data = await res.json();

      // ==============================================================
      // 【核心 Agent 闭环逻辑】：如果 AI 决定调用工具
      // ==============================================================
      if (data.is_tool_call && data.tool_calls && data.tool_calls.length > 0) {
        const toolCall = data.tool_calls[0];
        
        // 1. 处理 web_search (联网搜索)
        if (toolCall.function.name === 'web_search' && settings.enableWebSearch) {
          const args = JSON.parse(toolCall.function.arguments);
          const searchQuery = args.query;

          // 在聊天气泡中显示“正在搜索”的状态
          const tempAssistantMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `🔍 正在调用“全球实时搜索引擎”为您查找 **“${searchQuery}”** 的最新信息...`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, tempAssistantMsg]);

          // 调用新增的 /api/ai/web-search API
          const searchRes = await fetch('/api/ai/web-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: searchQuery }),
          });
          const searchData = await searchRes.json();

          // 把搜索得到的真实摘要，重新喂回给 AI 做大模型推理
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
      // ==============================================================

      // 普通回复（不包含工具调用）
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || '抱歉，暂时无法回答。',
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
      return; // ✅ Catch 中显式 return，消除 TS 7030 警告
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* ==================== Header ==================== */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 flex items-center justify-center">
              <span className="text-white text-xl">🤖</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">瓷韵 AI 助手</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">在线 · 智能全球服务</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* ==================== Messages 区域 (挂载拖拽事件) ==================== */}
        <div 
          className={`flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 relative ${isDraggingOver ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {isDraggingOver && (
            <div className="absolute inset-0 z-10 bg-blue-500/10 border-4 border-dashed border-blue-400 rounded-lg flex items-center justify-center pointer-events-none">
              <p className="text-blue-600 font-bold text-lg">📁 拖拽文件至此即可快速上传</p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-rose-500 text-white rounded-tr-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-tl-sm'
              }`}>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-white/20 pt-2">
                    {message.attachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs opacity-90">
                        {att.type === 'image' ? <><PhotoIcon className="w-4 h-4 shrink-0" />{att.previewUrl && <img src={att.previewUrl} alt={att.fileName} className="w-10 h-10 rounded object-cover shrink-0" />}</> : <DocumentTextIcon className="w-4 h-4 shrink-0" />}
                        <span className="truncate">{att.fileName}</span>
                      </div>
                    ))}
                  </div>
                )}
                <span className="text-xs opacity-60 mt-1 block">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl px-4 py-3 rounded-tl-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ==================== Input 区域 (修复UI重叠) ==================== */}
        <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
          {/* 附件预览条 */}
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

          {/* 布局升级：flex items-end 避免图标重叠 */}
          <div className="bg-gray-100 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 focus-within:border-rose-300 dark:focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-300 dark:focus-within:ring-rose-500 transition-all flex items-end">
            
            {/* 左侧工具栏 */}
            <div className="flex items-center gap-2 px-3 pb-2.5 pt-2">
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
                className="text-xs bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-rose-300 dark:focus:border-rose-500"
              >
                <option>DeepSeek-R1</option>
                <option>DeepSeek-V3</option>
              </select>
              
              <button 
                onClick={sendMessage}
                disabled={(!input.trim() && !attachments.some(a => !a.uploading && !a.error)) || isLoading}
                className="p-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition"
              >
                <PaperAirplaneIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ==================== 设置面板 ==================== */}
        {isSettingsOpen && (
          <div className="absolute right-4 top-16 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 z-50">
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
      </div>
    </div>
  );
}