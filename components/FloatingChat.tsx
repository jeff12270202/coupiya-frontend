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
  ServerStackIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import { toolLabel } from '@/lib/site-tools';
import FaceAuthModal from '@/components/FaceAuthModal';

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

/** 一次工具执行的留痕，用于向用户展示"我确实去查了/去做了" */
interface ToolStep {
  name: string;
  label: string;
  ok: boolean;
  /** 结果摘要或失败原因，直接展示给用户 */
  note: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
  /** 本条回复的真实来源信息（模型 / 用量）。仅 AI 真回了才有，失败时为空 —— 便于用户分辨真伪。 */
  meta?: { modelUsed?: string; usage?: Record<string, unknown> };
  /** Agent 执行过哪些工具。有步骤 = 这是一次"真去做了"的回答 */
  steps?: ToolStep[];
}

/** Agent Loop 的最大轮次 —— 防止工具互相触发导致无限循环（成本失控） */
const MAX_AGENT_ROUNDS = 4;

/** 把工具原始结果压成一句给用户看的进度描述（用户不需要看 JSON） */
function summarizeToolResult(name: string, result?: Record<string, unknown>): string {
  if (!result) return '已完成';
  switch (name) {
    case 'site_search':
      return Number(result.found ?? 0) > 0 ? `查到 ${result.found} 项相关服务` : '目录中没有匹配的服务';
    case 'search_product':
      return Number(result.found ?? 0) > 0 ? `找到 ${result.found} 件相关商品` : '没有匹配的在售商品';
    case 'search_blog':
      return Number(result.found ?? 0) > 0 ? `找到 ${result.found} 篇文章` : '没有匹配的文章';
    case 'get_my_account':
      return result.loggedIn ? `余额 ${result.balance ?? 0} Credits` : '尚未登录，已引导登录';
    case 'translate_text':
      return result.translation ? '翻译完成' : '翻译未返回结果';
    case 'web_search':
      return result.results ? '已取回联网结果' : '联网搜索无结果';
    default:
      return '已完成';
  }
}

/** 模型清单由 /api/ai/harness 下发（唯一事实来源 lib/ai-models.ts），前端不再硬编码 */
interface ModelOption {
  id: string;
  label: string;
  tier: string;
  desc: string;
}

/**
 * ⚠️ 已删除原 MOCK_RESPONSES 常量。
 *
 * 原实现在 catch 分支里随机返回一条"瓷韵 AI 助手"营销话术冒充 AI 回答
 * （旧代码第 415-423 行）—— 网络断了、上游 500 了、限流了，用户看到的却是
 * "这款陶瓷手链采用传统工艺制作…"，完全无法分辨这是 AI 答的还是编的。
 * 这是本项目明令禁止的"fake 成功"，必须彻底移除。现在失败就如实报错。
 */

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
  /** 初始为空，挂载后由 /api/ai/harness 下发真实清单并选中默认模型 */
  const [selectedModel, setSelectedModel] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  /** Harness Serverless Worker 是否已连接 —— 决定"深度任务"入口是可用还是给部署指引 */
  const [harnessReady, setHarnessReady] = useState(false);
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
  /** 刷脸登录弹窗 —— open_face_login 工具会拉起它，让助手能真正完成"引导登录"这一步 */
  const [faceOpen, setFaceOpen] = useState(false);
  /** 实时显示当前正在执行哪一步工具（比单纯转圈更能建立信任） */
  const [liveStep, setLiveStep] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // ==========================================================================
  // 【新增】模型清单 + Harness 主梁状态探测
  // --------------------------------------------------------------------------
  // 改版前模型名硬编码在这个组件里（只有 DeepSeek-R1 / DeepSeek-V3 两个选项），
  // 与后端 aliases 不一致。现在统一向 /api/ai/harness 取，改后端一处即全站生效。
  // ==========================================================================
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/ai/harness', { cache: 'no-store' });
        const data = (await res.json()) as { models?: ModelOption[]; defaultModel?: string; configured?: boolean };
        if (cancelled) return;
        if (Array.isArray(data.models) && data.models.length > 0) {
          setModels(data.models);
          setSelectedModel((cur) => cur || data.defaultModel || data.models![0]!.id);
        }
        setHarnessReady(data.configured === true);
      } catch {
        /* 探测失败不阻断聊天：下拉回落到内置兜底项 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  /**
   * 执行一次工具调用。
   *
   * 分工：
   *   · 客户端工具（navigate / scroll_to_section / open_harness / open_face_login）
   *     在这里【真的做动作】—— 跳页面、滚板块、开窗口、弹刷脸。
   *   · 服务端工具（site_search / search_product / search_blog / get_my_account /
   *     translate_text / web_search）交给 /api/ai/site-tools 执行。
   *
   * 任何失败都返回 ok:false + 真实原因，并把它作为 tool 消息回灌给模型 ——
   * 这样模型能读到"失败了、为什么失败"，从而改口或换工具，而不是继续编。
   */
  const runTool = useCallback(
    async (name: string, args: Record<string, unknown>): Promise<{ ok: boolean; note: string; payload: Record<string, unknown> }> => {
      switch (name) {
        case 'navigate': {
          const path = String(args.path ?? '');
          if (!path.startsWith('/')) {
            return { ok: false, note: '路径非法（必须以 / 开头）', payload: { ok: false, error: 'path 必须以 / 开头' } };
          }
          const reason = String(args.reason ?? '');
          // 延迟一点再跳，让用户先看到"正在带您前往"这句话，避免页面瞬间切走造成困惑
          window.setTimeout(() => {
            window.location.href = path;
          }, 900);
          return { ok: true, note: `正在带您前往 ${path}${reason ? `（${reason}）` : ''}`, payload: { ok: true, navigated: path } };
        }
        case 'scroll_to_section': {
          const section = String(args.section ?? '');
          const el = typeof document !== 'undefined' ? document.getElementById(section) : null;
          if (!el) {
            return {
              ok: false,
              note: `当前页面没有「${section}」板块`,
              payload: { ok: false, error: '当前页面不存在该板块（该工具只在 /satellite 生效）' },
            };
          }
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return { ok: true, note: `已定位到「${section}」板块`, payload: { ok: true, section } };
        }
        case 'open_harness': {
          window.open('/harness', 'coupiya-harness', 'width=1280,height=880,noopener,noreferrer');
          const reason = String(args.reason ?? '');
          return {
            ok: true,
            note: `已打开 Harness 主梁工作台${reason ? `（${reason}）` : ''}`,
            payload: { ok: true, opened: '/harness' },
          };
        }
        case 'open_face_login': {
          setFaceOpen(true);
          return { ok: true, note: '已弹出刷脸登录，请按提示完成人脸核身', payload: { ok: true, opened: true } };
        }
        default:
          break;
      }

      // ---- 服务端工具 ----
      try {
        const res = await fetch('/api/ai/site-tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, args }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: Record<string, unknown>; error?: string };
        if (!res.ok || data.ok === false) {
          const msg = data.error || `工具执行失败（HTTP ${res.status}）`;
          return { ok: false, note: msg, payload: { ok: false, error: msg } };
        }
        return { ok: true, note: summarizeToolResult(name, data.result), payload: { ok: true, result: data.result } };
      } catch (e) {
        const msg = e instanceof Error ? e.message : '工具执行异常';
        return { ok: false, note: msg, payload: { ok: false, error: msg } };
      }
    },
    [],
  );

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
      // ==================================================================
      // Agent Loop —— 让助手真正"能查、能做"
      // ------------------------------------------------------------------
      // 与改版前的本质区别：
      //   旧：只认 web_search 一个工具、只跑一轮；search_product 被声明了却
      //       没有执行分支 —— 模型调了也白调，反而给了它幻觉的来源。
      //   新：通用循环 AI → 工具调用 → 执行 → 结果回灌 → AI，
      //       最多 MAX_AGENT_ROUNDS 轮，防止工具互相触发把成本打爆。
      // ==================================================================
      const steps: ToolStep[] = [];
      /** 发给后端的 history：以本轮为起点，逐轮追加 assistant(tool_calls) 与 tool 结果 */
      const turnHistory: Array<Record<string, unknown>> = [];
      let finalText = '';
      let finalMeta: Message['meta'];

      for (let round = 0; round < MAX_AGENT_ROUNDS; round += 1) {
        const isFirst = round === 0;

        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // 后续轮次 message 为空：关键信息在 history 的 tool 消息里，
            // 后端对此有专门放行（hasToolTurn）
            message: isFirst ? input || '请分析我上传的内容' : '',
            history: isFirst ? messages : turnHistory,
            model: selectedModel,
            attachments: isFirst
              ? readyAttachments.map((a) => ({
                  type: a.type,
                  base64: a.base64,
                  text: a.text,
                  fileName: a.fileName,
                }))
              : [],
          }),
        });
        const data = await res.json().catch(() => ({}));

        // 上游 / 网关错误必须如实呈现（限流 429、上游 502、鉴权 401 都要说出来）
        if (!res.ok || data.success === false) {
          throw new Error(
            (data.message as string) || (data.error as string) || `聊天网关返回 HTTP ${res.status}`,
          );
        }

        /* ---------------- 分支 A：模型要调工具 ---------------- */
        if (data.is_tool_call && Array.isArray(data.tool_calls) && data.tool_calls.length > 0) {
          type RawToolCall = { id: string; type: string; function: { name: string; arguments: string } };
          const calls = data.tool_calls as RawToolCall[];
          turnHistory.push({ role: 'assistant', content: null, tool_calls: calls });

          for (const tc of calls) {
            const name = String(tc.function?.name ?? '');
            const label = toolLabel(name);
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = JSON.parse(tc.function?.arguments || '{}') as Record<string, unknown>;
            } catch {
              /* 参数不是合法 JSON 时按空对象处理，让工具自己报错 */
            }

            // 尊重用户在设置面板里的开关
            if (name === 'web_search' && !settings.enableWebSearch) {
              const note = '已在设置中关闭联网搜索，跳过';
              steps.push({ name, label, ok: false, note });
              turnHistory.push({
                role: 'tool',
                tool_call_id: tc.id,
                name,
                content: JSON.stringify({ ok: false, error: note }),
              });
              continue;
            }

            setLiveStep(`正在${label}…`);
            const outcome = await runTool(name, parsedArgs);
            steps.push({ name, label, ok: outcome.ok, note: outcome.note });
            turnHistory.push({
              role: 'tool',
              tool_call_id: tc.id,
              name,
              content: JSON.stringify(outcome.payload),
            });
          }

          setLiveStep('');
          continue; // 带着工具结果再问一次模型
        }

        /* ---------------- 分支 B：最终回答 ---------------- */
        finalText = String(data.reply ?? '');
        finalMeta = {
          modelUsed: data.model_used as string | undefined,
          usage: data.usage as Record<string, unknown> | undefined,
        };
        break;
      }

      setLiveStep('');
      if (!finalText) {
        finalText =
          steps.length > 0
            ? '（工具已执行完毕，但模型未给出最终答复。请再问一次，或换个说法。）'
            : '（AI 返回了空内容，请重试）';
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: finalText,
        timestamp: new Date(),
        meta: finalMeta,
        steps: steps.length > 0 ? steps : undefined,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      return; // ✅ 显式 return

    } catch (error) {
      // ==================================================================
      // 【关键修复】不再用随机营销话术冒充 AI 回答。
      // 失败就是失败：把真实原因显示出来，并告知用户可以改走 Harness 主梁。
      // ==================================================================
      const reason = error instanceof Error ? error.message : '未知错误';
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          `⚠️ 暂时无法连接 AI 服务\n\n原因：${reason}\n\n` +
          `（这不是 AI 的回答，而是系统如实报告的故障。请稍后重试；` +
          `若是限流，稍等 1 分钟即可。高精尖任务可改走 Harness 主梁。）`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      return; // ✅ Catch 中显式 return，消除剩余黄色警告
    } finally {
      setIsLoading(false);
      setLiveStep('');
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
            {/* ============================================================
                Harness 主梁入口 —— 打开独立跳窗工作台
                工程图纸 / 复杂代码这类分钟级任务不适合塞在这个小浮窗里：
                用户需要一边看执行轨迹一边继续逛店，所以开新窗口。
                ============================================================ */}
            <button
              onClick={() => window.open('/harness', 'coupiya-harness', 'width=1280,height=880,noopener,noreferrer')}
              title={harnessReady ? '打开 Harness 主梁工作台（高精尖任务）' : 'Harness 主梁未连接，点击查看部署指引'}
              className="relative p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
            >
              <ServerStackIcon className="w-4 h-4" />
              <span
                className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${harnessReady ? 'bg-emerald-300' : 'bg-amber-300'}`}
              />
            </button>
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

                      {/* Agent 执行留痕：让用户看见"它确实去查了/去做了"，而不是只有一段话 */}
                      {message.steps && message.steps.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-black/10 dark:border-white/15 pt-2">
                          {message.steps.map((s, i) => (
                            <div key={`${s.name}-${i}`} className="flex items-start gap-1.5 text-[11px] leading-snug opacity-85">
                              <span className={s.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                                {s.ok ? '●' : '○'}
                              </span>
                              <span className="font-medium flex-shrink-0">{s.label}</span>
                              <span className="opacity-75 break-all">{s.note}</span>
                            </div>
                          ))}
                        </div>
                      )}
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
                      <p className="text-xs opacity-70 mt-1 flex items-center gap-2 flex-wrap">
                        <span>{message.timestamp.toLocaleTimeString()}</span>
                        {/* 真实来源标注：只有 AI 真回了才有 meta，失败消息这里为空 ——
                            用户一眼就能分辨"这是 AI 说的"还是"系统报的故障"。 */}
                        {message.meta?.modelUsed && (
                          <span className="opacity-80 font-mono">{message.meta.modelUsed}</span>
                        )}
                        {message.meta?.usage && typeof message.meta.usage === 'object' && 'total_tokens' in (message.meta.usage as Record<string, unknown>) && (
                          <span className="opacity-70 font-mono">
                            {String((message.meta.usage as Record<string, unknown>).total_tokens)} tokens
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-gray-700 rounded-2xl px-4 py-3 rounded-tl-sm shadow-md">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-rose-400 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                        <span className="w-2 h-2 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                        {/* 有工具在执行时显示具体动作 —— 比单纯转圈更能建立信任 */}
                        {liveStep && <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">{liveStep}</span>}
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
                    title="执行模型（清单来自服务端注册表）"
                    className="text-xs bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg px-2 py-1 text-gray-700 dark:text-gray-300 focus:outline-none max-w-[104px]"
                  >
                    {models.length === 0 && <option value="">加载模型…</option>}
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  {/* Harness 深度任务：小浮窗放不下的分钟级任务走这里 */}
                  <button
                    onClick={() => window.open('/harness', 'coupiya-harness', 'width=1280,height=880,noopener,noreferrer')}
                    title="高精尖 / 工程图纸 / 复杂代码 → 打开 Harness 主梁工作台"
                    className="p-2 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 text-gray-600 dark:text-gray-300 rounded-lg hover:text-indigo-500 transition-colors"
                  >
                    <BoltIcon className="w-4 h-4" />
                  </button>
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

      {/* 刷脸登录弹窗 —— 由 open_face_login 工具或用户点击触发。
          放在浮窗根节点下（而非内容区内），最小化时也能正常弹出。 */}
      <FaceAuthModal
        open={faceOpen}
        onClose={() => setFaceOpen(false)}
        onSuccess={() => setFaceOpen(false)}
      />
    </div>
  );
}