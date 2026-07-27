import { NextResponse } from 'next/server';
// 改用 require 导入，完美消除找不到模块类型的红线报错 (ts(2307))
const serialize = require('php-serialize');

export async function POST(req: Request) {
    try {
        const { aiVideoUrl, movieTitle } = await req.json();
        
        // 1. 读取环境变量：应用密码
        const APP_PASSWORD = process.env.WP_APP_PASSWORD;
        if (!APP_PASSWORD) {
            throw new Error("WP_APP_PASSWORD 未配置，请在 .env.local 设置");
        }

        const WP_API_BASE = 'https://blog.coupiya.com/wp-json/wp/v2';
        const AUTH_HEADER = `Basic ${Buffer.from(`coupiya_admin:${APP_PASSWORD}`).toString('base64')}`;

        // 2. 抓取 AI 生成的视频流并上传到 WP 媒体库
        const videoRes = await fetch(aiVideoUrl);
        if (!videoRes.ok) throw new Error("无法下载 AI 生成的视频文件");

        const videoBuffer = await videoRes.arrayBuffer();
        const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });

        const formData = new FormData();
        formData.append('file', videoBlob, `ai_movie_${Date.now()}.mp4`);

        const mediaRes = await fetch(`${WP_API_BASE}/media`, {
            method: 'POST',
            headers: { 'Authorization': AUTH_HEADER },
            body: formData,
        });

        if (!mediaRes.ok) {
            const errText = await mediaRes.text();
            throw new Error(`上传媒体库失败: ${errText}`);
        }

        const mediaData = await mediaRes.json();
        const sourceUrl = mediaData.source_url;
        const mediaId = mediaData.id; // 拿到上传后的媒体文件 ID

        // 3. 构造 MAS Videos 需要的数据源序列化数组结构
        const videoSources = [
            {
                name: sourceUrl,                      // 您的视频绝对地址
                choice: 'movie_embed',                // 播放方式
                embed_content: '',
                link: '',
                is_affiliate: false,
                quality: '',
                language: '',
                player: '',
                date_added: '',
                position: 0,
            }
        ];

        // 将 JS 数组转换为 PHP 序列化字符串 (对应数据库里的 a:1:{...} )
        const serializedSources = serialize(videoSources);

        // 4. 发布为 MAS Videos 电影 (自动归类到 AI 科幻巨制: ID 59)
        const postRes = await fetch(`${WP_API_BASE}/movie`, {
            method: 'POST',
            headers: { 
                'Authorization': AUTH_HEADER, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                title: movieTitle || `AI 自动生成电影 ${new Date().toLocaleDateString()}`,
                status: 'publish',
                movie_genre: [59],  // 【核心】自动归类到 AI 科幻巨制
                meta: {
                    "_sources": serializedSources, // 注入准确的序列化源
                    "_thumbnail_id": mediaId,      // ✅【核心添加】将视频媒体ID设为电影封面！
                    // 如果有 AI 返回的时长，可以加 "_movie_run_time": "300"
                }
            })
        });

        if (!postRes.ok) {
            const errText = await postRes.text();
            throw new Error(`发布电影失败: ${errText}`);
        }

        const postData = await postRes.json();

        // 5. 返回成功给前端
        return NextResponse.json({ 
            success: true, 
            postId: postData.id, 
            editLink: postData.link 
        });

    } catch (error: any) {
        console.error("AI 电影自动发布流程异常:", error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}