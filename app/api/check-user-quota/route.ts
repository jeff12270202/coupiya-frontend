import { NextResponse } from 'next/server';
// 注意：npm i tencentcloud-sdk-nodejs
const COS = require('tencentcloud-sdk-nodejs').cos; 

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'default'; // 用户 ID

  const cosClient = new COS({
    SecretId: process.env.UGC_SECRET_ID,
    SecretKey: process.env.UGC_SECRET_KEY,
    Region: 'ap-guangzhou', // 您的 COS 地域
  });

  try {
    // 获取该用户文件夹下的所有文件
    const data = await cosClient.getBucket({
      Bucket: 'coupiya-ai-video-1258748690',
      Prefix: `user_${userId}/`,
    });
    
    let totalSize = 0;
    data.Contents?.forEach((item: any) => totalSize += item.Size);

    // 限制 5GB (5 * 1024 * 1024 * 1024)
    const maxSize = 5 * 1024 * 1024 * 1024; 

    return NextResponse.json({ 
      success: true, 
      currentSize: totalSize, 
      canUpload: totalSize < maxSize,
      maxSize 
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: '查询失败' }, { status: 500 });
  }
}