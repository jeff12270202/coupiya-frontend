import React from 'react';

const RenderEditorJSON = ({ data }: { data: any }) => {
  if (!data || !data.blocks) return <p>{data}</p>;
  return (
    <div className="editor-content">
      {data.blocks.map((block: any, idx: number) => {
        switch (block.type) {
          case 'paragraph':
            return <p key={idx} dangerouslySetInnerHTML={{ __html: block.data.text }} />;
          case 'header':
            const HeaderTag = `h${block.data.level}` as keyof JSX.IntrinsicElements;
            return <HeaderTag key={idx} dangerouslySetInnerHTML={{ __html: block.data.text }} />;
          // 添加更多类型...
          default:
            return <div key={idx}>{block.data.text}</div>;
        }
      })}
    </div>
  );
};
export default RenderEditorJSON;