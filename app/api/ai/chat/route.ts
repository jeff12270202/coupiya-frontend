import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      message,
      history = [],
      model: rawModel,
      attachments = [], // 多模态附件
      tools = [],       // 【智能体功能】前端传入的工具定义
      tool_choice = 'auto', // 工具调用策略
    } = body;

    // =======================================================================
    // 🔥 核心修正1： 彻底废弃深拷贝的问题模型名！
    //    根据本机 CURL 测试，只有 "deepseek/deepseek-r1" 能在这个 Hermes 上跑通。
    //    "deepseek-chat" 会导致 404，所以前端只能选 R1，或者代码强制转 R1。
    // =======================================================================
    const modelMap: Record<string, string> = {
      'DeepSeek-R1': 'deepseek/deepseek-r1',
      'DeepSeek-V3': 'deepseek/deepseek-r1', // 如果你选了V3，这里强制降级到 R1，防止 404 报错！
      'deepseek-r1': 'deepseek/deepseek-r1',
      'deepseek-v3': 'deepseek/deepseek-r1',
    };
    // 杜绝传任何不认识的模型，全强制走我们测试成功的 deepseek/deepseek-r1
    const model = modelMap[rawModel] || 'deepseek/deepseek-r1';

    // =======================================================================
    // 构建多模态 User Message (支持图片+文本)
    // =======================================================================
    const userContentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    userContentParts.push({ type: 'text', text: message || '请分析以下内容' });

    let hasImage = false;
    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        if (att.type === 'image' && att.base64) {
          userContentParts.push({
            type: 'image_url',
            image_url: { url: att.base64 },
          });
          hasImage = true;
        }
      }
    }

    const userMessageContent =
      userContentParts.length === 1 && userContentParts[0]?.type === 'text'
        ? userContentParts[0].text
        : userContentParts;

    // 清理聊天历史记录
    const cleanHistory = (history as Array<{ role: string; content: string }>).map(
      ({ role, content }) => ({ role, content })
    );

    // =======================================================================
    // 文档附件处理 (RAG 注入)
    // =======================================================================
    let documentContext = '';
    if (attachments && Array.isArray(attachments)) {
      const docs = attachments.filter((a) => a.type === 'document' && a.text);
      if (docs.length > 0) {
        documentContext =
          '\n\n--- 用户上传的文档内容（请基于此内容回答问题）---\n' +
          docs.map((d, i) => `[文档${i + 1}: ${d.fileName}]\n${d.text}`).join('\n\n') +
          '\n--- 文档内容结束 ---';
      }
    }

    const systemContent =
      '你是瓷韵 AI 智能体助手，专门帮助用户推荐陶瓷饰品、解答产品问题、提供文化建议，并具备调用外部工具来获取实时信息的能力。' +
      (hasImage ? ' 如果用户提供了图片，请分析图片中的内容，结合陶瓷文化给出专业建议。' : '') +
      documentContext;

    // 组装消息体
    const messages = [
      { role: 'system', content: systemContent },
      ...cleanHistory,
      { role: 'user', content: userMessageContent },
    ];

    // 构造请求体
    const requestBody: any = {
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4000, // 提高最大 token 限制，方便工具调用返回更多结果
    };

    // 【智能体灵魂】如果有工具定义，就放进请求体里
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = tool_choice;
    }

    // =======================================================================
    // 核心：直连 VM100119 Hermes 内网 IP
    // =======================================================================
    const HERMES_CHAT_ENDPOINT =
      process.env.HERMES_CHAT_ENDPOINT ||
      'http://10.136.131.232:8082/v1/chat/completions';

    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 务必确保 .env.local 中载入的是能跑通 deepseek/deepseek-r1 的那把 KEY
    if (process.env.HERMES_API_KEY) {
      forwardHeaders['Authorization'] = `Bearer ${process.env.HERMES_API_KEY}`;
    } else {
      const authHeader = req.headers.get('authorization');
      if (authHeader) {
        forwardHeaders['Authorization'] = authHeader;
      }
    }

    // 发送请求给 Hermes 智能体引擎
    const hermesResponse = await fetch(HERMES_CHAT_ENDPOINT, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(requestBody),
    });

    // =======================================================================
    // 🔥 核心修正2：彻底消灭“假回复”！
    //    如果 Hermes 没返回 200，直接把真实报错抛给前端，不再写死假话！
    // =======================================================================
    if (!hermesResponse.ok) {
      const errorText = await hermesResponse.text().catch(() => '未知错误');
      console.error(`Hermes 返回异常 ${hermesResponse.status}: ${errorText}`);
      return NextResponse.json(
        { 
          error: `Hermes API Error [${hermesResponse.status}]`, 
          details: errorText,
          success: false 
        },
        { status: hermesResponse.status }
      );
    }

    // 解析 Hermes 返回的真实数据
    const data = await hermesResponse.json();
    const choice = data.choices?.[0]?.message;

    // =======================================================================
    // 【智能体核心】检测是否包含工具调用 (Tool Calls)
    //    如果有 tool_calls，前端浏览器需要执行这些工具并回传结果。
    // =======================================================================
    if (choice?.tool_calls && choice.tool_calls.length > 0) {
      return NextResponse.json({
        tool_calls: choice.tool_calls,
        role: choice.role || 'assistant',
        success: true,
        is_tool_call: true, // 标记给前端知道这是调用工具，不要直接展示为文字
      });
    }

    // 普通文本回复
    const reply = choice?.content?.trim() || '（Hermes 返回了空的思考结果）';
    return NextResponse.json({
      reply,
      success: true,
    });

  } catch (error: any) {
    console.error('Chat API 无法连接到 Hermes:', error);
    // 绝不返回模板话术！直接告诉前端连接失败。
    return NextResponse.json(
      { 
        error: 'Hermes 代理服务连接异常', 
        details: error.message,
        success: false 
      },
      { status: 500 }
    );
  }
}