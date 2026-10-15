// ============================================================================
// app/api/ai/publish-movie/route.ts —— 发布闸门别名路由
// 兼容旧路径 /api/ai/publish-movie，实际逻辑在 /api/ai/publish-vod-movie
// （全站规范路径为 publish-vod-movie，与 Cloud Studio main.py 一致）
// ============================================================================

export { POST } from '../publish-vod-movie/route';
