export async function uploadToWordPress(fileBlob: Blob, fileName: string, _fileType: string) {
  const WP_USER = process.env.WP_USER;
  const WP_PASSWORD = process.env.WP_PASSWORD;
  const WP_REST_URL = process.env.NEXT_PUBLIC_WP_REST_URL || 'https://api.coupiya.com/wordpress/wp-json/';

  if (!WP_USER || !WP_PASSWORD) {
    throw new Error('请先在 .env.local 中配置有效的 WP_USER 和 WP_PASSWORD');
  }

  const formData = new FormData();
  formData.append('file', fileBlob, fileName);
  formData.append('title', fileName);

  const response = await fetch(`${WP_REST_URL}wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64'),
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`上传到 WordPress 失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.id; // 返回媒体 ID，后续可结合 MAS Videos 插件进行挂载
}