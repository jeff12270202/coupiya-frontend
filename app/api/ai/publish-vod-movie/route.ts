import { NextResponse } from 'next/server';
const { serialize } = require('php-serialize');

export async function POST(req: Request) {
    try {
        // ================= 将腾讯云 SDK 初始化移入函数内部（解决构建报错） =================
        const tencentcloud = require('tencentcloud-sdk-nodejs');
        const VodClient = tencentcloud.vod.v20180717.Client;
        // ===================================================================================

        const { aiVideoUrl, movieTitle } = await req.json();
        if (!aiVideoUrl) throw new Error("缺少 aiVideoUrl 参数");

        // ================= 读取环境变量 =================
        const APP_PASSWORD = process.env.WP_APP_PASSWORD;
        const SECRET_ID = process.env.SECRET_ID;
        const SECRET_KEY = process.env.SECRET_KEY;
        const WP_API_BASE = process.env.NEXT_PUBLIC_WP_API_URL;
        if (!WP_API_BASE) {
            throw new Error("环境变量 NEXT_PUBLIC_WP_API_URL 未配置，请检查 .env.local 文件");
        }
        const AUTH_HEADER = `Basic ${Buffer.from(`coupiya_admin:${APP_PASSWORD}`).toString('base64')}`;

        // 1. 初始化腾讯云 VOD SDK 客户端（SDK v4 API）
        const client = new VodClient({
            credential: {
                secretId: SECRET_ID,
                secretKey: SECRET_KEY,
            },
            region: "ap-guangzhou",
            profile: {
                httpProfile: {
                    endpoint: "vod.tencentcloudapi.com",
                },
            },
        });

        // 2. 使用 PullUpload 直接从 URL 拉取视频到 VOD（无需手动下载上传）
        console.log("⬆️ 正在通过 PullUpload 拉取视频到 VOD...");
        const pullResp = await client.PullUpload({
            MediaUrl: aiVideoUrl,
            MediaName: movieTitle || `AI视频_${Date.now()}`,
            MediaType: "mp4",
        });
        const taskId = pullResp.TaskId;
        console.log("✅ PullUpload 任务已提交，TaskId:", taskId);

        // 返回 taskId 供后续轮询
        // 立即轮询任务状态（最多等待 180 秒）
        console.log("⏳ 等待 PullUpload 任务完成...");
        let fileId = '';
        let playUrl = '';
        let attempts = 0;
        const maxAttempts = 90; // 最多 3 分钟

        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 2000));
            attempts++;

            const taskResp = await client.DescribeTaskDetail({
                TaskId: taskId,
            });

            if (taskResp.Status === 'FINISH') {
                fileId = taskResp?.PullUploadTask?.FileId || '';
                if (fileId) {
                    console.log("✅ PullUpload 完成，FileId:", fileId);
                    break;
                }
            } else if (taskResp.Status === 'FAILED') {
                throw new Error(`PullUpload 任务失败: ${taskResp?.PullUploadTask?.Message || '未知错误'}`);
            }

            if (attempts % 10 === 0) {
                console.log(`⏳ 等待中... (${attempts * 2}s), 状态: ${taskResp.Status}`);
            }
        }

        if (!fileId) throw new Error("PullUpload 超时，请稍后查看任务状态");

        // 3. 获取视频播放地址
        console.log("🔍 获取视频信息...");
        const mediaResp = await client.DescribeMediaInfos({
            FileIds: [fileId],
            Filters: ["basicInfo"],
        });
        const mediaInfo = mediaResp.MediaInfoSet?.[0];
        if (mediaInfo?.MediaUrl) {
            playUrl = mediaInfo.MediaUrl;
        } else if (mediaInfo?.BasicInfo?.MediaUrl) {
            playUrl = mediaInfo.BasicInfo.MediaUrl;
        }

        if (!playUrl) {
            // 再等一等，VOD 可能需要时间处理
            console.log("⏳ 等待 VOD 生成播放地址...");
            attempts = 0;
            while (attempts < 30 && !playUrl) {
                await new Promise(r => setTimeout(r, 2000));
                attempts++;
                const retryResp = await client.DescribeMediaInfos({
                    FileIds: [fileId],
                });
                const info = retryResp.MediaInfoSet?.[0];
                playUrl = info?.MediaUrl || info?.BasicInfo?.MediaUrl || '';
            }
        }

        if (!playUrl) throw new Error("无法获取视频播放地址");
        console.log("✅ 播放地址:", playUrl);

        // 4. 准备 MAS Videos 序列化数据并发布到 WordPress
        const videoSources = [{
            name: playUrl,
            choice: 'movie_embed',
            embed_content: '',
            link: '',
            is_affiliate: false,
            quality: '',
            language: '',
            player: '',
            date_added: '',
            position: 0,
        }];
        const serializedSources = serialize(videoSources);

        console.log("🎬 正在发布到 WordPress...");
        const postRes = await fetch(`${WP_API_BASE}/movie`, {
            method: 'POST',
            headers: { 'Authorization': AUTH_HEADER, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: movieTitle || `VOD 电影 ${new Date().toLocaleDateString()}`,
                status: 'publish',
                movie_genre: [59],
                meta: {
                    "sources": serializedSources,
                }
            })
        });

        const postData = await postRes.json();
        console.log("🎉 全自动发布成功！电影 ID:", postData.id);

        return NextResponse.json({ success: true, postId: postData.id, fileId, playUrl });

    } catch (error: any) {
        const errMsg = error?.message || error?.toString?.() || String(error) || '未知错误';
        console.error("🔥 发布异常:", errMsg);
        console.error("🔥 错误详情:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return NextResponse.json({ success: false, error: errMsg, requestId: error?.requestId, traceId: error?.traceId, code: error?.code }, { status: 500 });
    }
}