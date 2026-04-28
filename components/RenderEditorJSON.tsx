import React from 'react';

/**
 * 安全渲染 Saleor 的 descriptionJson 富文本内容
 * 如果解析失败，返回纯文本字符串，绝不显示 JSON 原文
 */
const RenderEditorJSON = ({ data }: { data: any }) => {
  // 若数据为空，返回占位符
  if (!data) return <span className="text-gray-400">无描述</span>;

  // 如果 data 是字符串，直接返回（处理纯文本情况）
  if (typeof data === 'string') return <p>{data}</p>;

  // 如果是旧版纯文本字段（例如 description 字段），也可能返回字符串，兼容处理
  if (data.blocks && Array.isArray(data.blocks)) {
    return (
      <div className="editor-content space-y-2">
        {data.blocks.map((block: any, idx: number) => {
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
              // 未知类型，简单显示文本内容（如果有）
              const text = block.data?.text || block.data?.content || '';
              return text ? <p key={idx} dangerouslySetInnerHTML={{ __html: text }} /> : null;
          }
        })}
      </div>
    );
  }

  // 如果既不是 blocks 结构也不是字符串，尝试输出安全的纯文本（避免显示 JSON）
  if (data.text) {
    return <p dangerouslySetInnerHTML={{ __html: data.text }} />;
  }
  return <span className="text-gray-400">（描述格式暂不支持）</span>;
};

export default RenderEditorJSON;