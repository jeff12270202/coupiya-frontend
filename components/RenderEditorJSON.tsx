'use client'; // ✅ 必须加上，因为这里用了 JSX 和 DOM 操作

import React from 'react';

const RenderEditorJSON = ({ data }: { data: any }) => {
  // 1. 如果数据为空，返回占位符
  if (!data) return <span className="text-gray-400">无描述</span>;

  let parsedData = data;

  // 2. ⚠️ 关键修复：如果是字符串，尝试解析成 JSON 对象！
  if (typeof data === 'string') {
    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      // 如果解析失败（说明不是标准JSON），直接把原文字符串当成纯文本输出
      return <p>{data}</p>;
    }
  }

  // 3. 如果是纯字符串（例如旧版 description 字段），直接返回文本
  if (typeof parsedData === 'string') return <p>{parsedData}</p>;

  // 4. 解析正常的 EditorJS 数据结构
  if (parsedData.blocks && Array.isArray(parsedData.blocks)) {
    return (
      <div className="editor-content space-y-2">
        {parsedData.blocks.map((block: any, idx: number) => {
          switch (block.type) {
            case 'paragraph':
              return (
                <p
                  key={idx}
                  dangerouslySetInnerHTML={{ __html: block.data.text || '' }}
                  className="leading-relaxed"
                />
              );
            case 'header':
              const HeaderTag = `h${block.data.level || 2}` as keyof JSX.IntrinsicElements;
              return (
                <HeaderTag
                  key={idx}
                  dangerouslySetInnerHTML={{ __html: block.data.text || '' }}
                  className="font-semibold mt-2 mb-1"
                />
              );
            case 'list':
              const items = block.data.items || [];
              const ListTag = block.data.style === 'ordered' ? 'ol' : 'ul';
              return (
                <ListTag key={idx} className="list-inside list-disc ml-2">
                  {items.map((item: string, i: number) => (
                    <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
                  ))}
                </ListTag>
              );
            case 'quote':
              return (
                <blockquote
                  key={idx}
                  className="border-l-4 border-rose-300 pl-3 italic text-gray-600"
                  dangerouslySetInnerHTML={{ __html: block.data.text || '' }}
                />
              );
            default:
              const text = block.data?.text || block.data?.content || '';
              return text ? <p key={idx} dangerouslySetInnerHTML={{ __html: text }} /> : null;
          }
        })}
      </div>
    );
  }

  // 5. 最终兜底
  if (parsedData.text) {
    return <p dangerouslySetInnerHTML={{ __html: parsedData.text }} />;
  }
  return <span className="text-gray-400">（描述格式暂不支持）</span>;
};

export default RenderEditorJSON;