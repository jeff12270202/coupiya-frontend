// ============================================================
// NEW: lib/media-url.ts
// 统一媒体 URL 处理工具 - 所有组件都应该通过这个函数获取图片 URL
// 防止 Saleor Docker 内部地址 (localhost, minio) 泄露到前端
// ============================================================

/**
 * 将 Saleor 返回的各种可能的图片 URL 统一转换为正确的 CDN URL
 *
 * Saleor 可能返回的 URL 格式:
 *   - http://localhost:8000/media/products/xxx.jpg     (Django dev server)
 *   - http://minio:9000/saleor-media/products/xxx.jpg  (Docker 内部 MinIO)
 *   - /media/products/xxx.jpg                           (相对路径)
 *   - https://api.coupiya.com/media/products/xxx.jpg    (通过 API 域名)
 *   - https://media.coupiya.com/products/xxx.jpg        (正确格式 ✓)
 */
export function getMediaUrl(rawUrl: string | null | undefined): string {
	// 空值保护
	if (!rawUrl) {
		return "/placeholder.png";
	}

	// 已经是正确的 media.coupiya.com 格式
	if (rawUrl.includes("media.coupiya.com")) {
		return rawUrl;
	}

	// 处理完整的 http(s) URL
	if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
		try {
			const url = new URL(rawUrl);
			// 提取路径并去除 /saleor-media 前缀（MinIO bucket name）
			let pathname = url.pathname;
			pathname = pathname.replace(/^\/saleor-media/, "");
			return `https://media.coupiya.com${pathname}`;
		} catch {
			// URL 解析失败，回退到简单处理
		}
	}

	// 处理相对路径
	let cleanPath = rawUrl;
	// 去掉 /saleor-media 前缀
	cleanPath = cleanPath.replace(/^\/?saleor-media\//, "/");
	// 确保以 / 开头
	if (!cleanPath.startsWith("/")) {
		cleanPath = "/" + cleanPath;
	}
	return `https://media.coupiya.com${cleanPath}`;
}

/**
 * 获取缩略图 URL
 * 缩略图路径: /thumbnail/products/xxx.jpg → media.coupiya.com/thumbnail/products/xxx.jpg
 */
export function getThumbnailUrl(rawUrl: string | null | undefined): string {
	if (!rawUrl) return "/placeholder.png";

	if (rawUrl.includes("media.coupiya.com")) {
		return rawUrl;
	}

	if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
		try {
			const url = new URL(rawUrl);
			let pathname = url.pathname;
			pathname = pathname.replace(/^\/saleor-media/, "");
			return `https://media.coupiya.com/thumbnail${pathname}`;
		} catch {}
	}

	let cleanPath = rawUrl.replace(/^\/?saleor-media\//, "/");
	if (!cleanPath.startsWith("/")) cleanPath = "/" + cleanPath;
	return `https://media.coupiya.com/thumbnail${cleanPath}`;
}

/**
 * 获取静态文件 URL
 */
export function getStaticUrl(path: string | null | undefined): string {
	if (!path) return "";
	if (path.startsWith("http")) return path;
	const cleanPath = path.startsWith("/") ? path : "/" + path;
	return `https://api.coupiya.com/static${cleanPath}`;
}
