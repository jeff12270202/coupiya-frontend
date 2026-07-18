"use client";

import { useState, useRef, useEffect } from 'react';
import { XMarkIcon, PaperAirplaneIcon, PaperClipIcon, PhotoIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

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

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';
const DOC_ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

export default function AIChatModal({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我是瓷韵 AI 助手，很高兴为你服务！\n\n✨ 新功能：点击 📎 上传图片或文档，我能帮你分析图片内容、解读产品手册哦～',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('DeepSeek-R1');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 点击菜单外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showAttachmentMenu && attachmentMenuRef.current && !attachmentMenuRef.current.contains(e.target as Node)) {
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
      type: category, fileName: file.name, mimeType: file.type,
      previewUrl: category === 'image' ? URL.createObjectURL(file) : undefined,
      uploading: true,
    };
    setAttachments(prev => [...prev, { ...tempAtt }]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/ai/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setAttachments(prev => prev.map(a => a.fileName === file.name && a.uploading
          ? { ...a, base64: data.base64, text: data.text, uploading: false, error: undefined }
          : a));
      } else {
        setAttachments(prev => prev.map(a => a.fileName === file.name && a.uploading
          ? { ...a, uploading: false, error: data.error || '上传失败' }
          : a));
      }
    } catch (err) {
      setAttachments(prev => prev.map(a => a.fileName === file.name && a.uploading
        ? { ...a, uploading: false, error: '网络异常，上传失败' }
        : a));
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

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
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input || '请分析我上传的内容',
          history: messages,
          model: selectedModel,
          attachments: readyAttachments.map(a => ({ type: a.type, base64: a.base64, text: a.text, fileName: a.fileName })),
        }),
      });

      const data = await response.json();
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || '抱歉，我暂时无法回答这个问题。',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '网络连接异常，请检查网络后重试。',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
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
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 flex items-center justify-center">
              <span className="text-white text-xl">🤖</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">瓷韵 AI 助手</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">在线 · 陶瓷饰品推荐</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-rose-500 text-white rounded-tr-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-tl-sm'
                }`}
              >
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

        {/* Input Area */}
        <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
          {/* 附件预览 */}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((att, index) => (
                <div key={index} className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${att.error ? 'bg-red-50 border border-red-200 text-red-600' : att.uploading ? 'bg-amber-50 border border-amber-200 text-amber-600 animate-pulse' : 'bg-rose-50 border border-rose-200 text-rose-600'}`}>
                  {att.type === 'image' ? att.previewUrl ? <img src={att.previewUrl} alt={att.fileName} className="w-8 h-8 rounded object-cover shrink-0" /> : <PhotoIcon className="w-4 h-4 shrink-0" /> : <DocumentTextIcon className="w-4 h-4 shrink-0" />}
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
          <div className="relative bg-gray-100 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 focus-within:border-rose-300 dark:focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-300 dark:focus-within:ring-rose-500 transition-all">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="给 Assistant 发消息 (Enter 发送)"
              rows={1}
              className="w-full bg-transparent px-4 py-3 pr-32 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none"
              style={{ maxHeight: '200px' }}
            />
            
            {/* Toolbar */}
            <div className="absolute bottom-2 left-3 flex items-center gap-2">
              <div className="relative" ref={attachmentMenuRef}>
                <button
                  onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                  className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition"
                  title="添加附件"
                >
                  <PaperClipIcon className="w-4 h-4" />
                </button>
                {showAttachmentMenu && (
                  <div className="absolute bottom-10 left-0 bg-white dark:bg-gray-700 rounded-xl shadow-xl border border-gray-200 dark:border-gray-600 py-1 w-44 z-50">
                    <button onClick={() => { imageInputRef.current?.click(); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                      <PhotoIcon className="w-5 h-5 text-rose-500" /><span>上传图片</span>
                    </button>
                    <button onClick={() => { docInputRef.current?.click(); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                      <DocumentTextIcon className="w-5 h-5 text-rose-500" /><span>上传文档</span>
                    </button>
                    <div className="border-t border-gray-100 dark:border-gray-600 my-1"></div>
                    <div className="px-4 py-1.5 text-[10px] text-gray-400 dark:text-gray-500">支持 JPG/PNG/PDF/DOCX/TXT</div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Side Controls */}
            <div className="absolute bottom-2 right-3 flex items-center gap-2">
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
      </div>
    </div>
  );
}