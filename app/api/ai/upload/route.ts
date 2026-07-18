import { NextRequest, NextResponse } from 'next/server';

/**
 * 文件上传 API 路由
 * 
 * 支持类型：
 *  - 图片：jpg, jpeg, png, gif, webp → 转为 Base64 返回
 *  - 文档：pdf, docx, txt         → 解析为纯文本返回
 *  - Word (.doc)：暂不支持，提示用户转换格式
 * 
 * 响应格式：
 * {
 *   success: true,
 *   fileType: "image" | "document",
 *   base64?: string,          // 图片 base64 (含 data:image/... 前缀)
 *   text?: string,            // 文档纯文本摘要 (≤8000 字符)
 *   fileName: string,
 *   mimeType: string,
 * }
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024;  // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '未检测到上传文件' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `文件过大，最大支持 ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    const mimeType = file.type;
    const fileName = file.name;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ================================================================
    // 图片处理：转为 Base64
    // ================================================================
    if (ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      const base64 = buffer.toString('base64');
      const dataUri = `data:${mimeType};base64,${base64}`;

      return NextResponse.json({
        success: true,
        fileType: 'image',
        base64: dataUri,
        fileName,
        mimeType,
      });
    }

    // ================================================================
    // TXT 纯文本处理
    // ================================================================
    if (mimeType === 'text/plain') {
      const text = buffer.toString('utf-8').slice(0, 8000);
      return NextResponse.json({
        success: true,
        fileType: 'document',
        text,
        fileName,
        mimeType,
      });
    }

    // ================================================================
    // PDF 文档处理
    // ================================================================
    if (mimeType === 'application/pdf') {
      try {
        // pdf-parse v1.x 直接导出函数
        const pdfParse = (await import('pdf-parse')) as any;
        const parseFn = pdfParse.default || pdfParse;
        const data = await parseFn(buffer);
        const text = (data.text || '').slice(0, 8000);
        return NextResponse.json({
          success: true,
          fileType: 'document',
          text,
          fileName,
          mimeType,
        });
      } catch (pdfError) {
        console.error('PDF 解析失败:', pdfError);
        return NextResponse.json(
          {
            success: false,
            error: 'PDF 解析失败，请确认文件未损坏或使用纯文本格式',
          },
          { status: 422 }
        );
      }
    }

    // ================================================================
    // DOCX 文档处理
    // ================================================================
    if (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        const text = (result.value || '').slice(0, 8000);
        return NextResponse.json({
          success: true,
          fileType: 'document',
          text,
          fileName,
          mimeType,
        });
      } catch (docError) {
        console.error('Word 文档解析失败:', docError);
        return NextResponse.json(
          {
            success: false,
            error: 'Word 文档解析失败，请确认文件未损坏或使用纯文本格式',
          },
          { status: 422 }
        );
      }
    }

    // ================================================================
    // 不支持的文件类型
    // ================================================================
    return NextResponse.json(
      {
        success: false,
        error: `不支持的文件类型 (${mimeType})。支持的格式：JPG/PNG/GIF/WebP/PDF/DOCX/TXT`,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('文件上传处理异常:', error);
    return NextResponse.json(
      { success: false, error: '服务器处理上传时出错，请重试' },
      { status: 500 }
    );
  }
}
