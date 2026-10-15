// ============================================================
// next.config.js 修复
// 确保远程图片域名在白名单中
// ============================================================

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.coupiya.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "api.coupiya.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "coupiya.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.coupiya.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "dashboard.coupiya.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: 'https',
        hostname: 'image.pollinations.ai',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'blog.coupiya.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'coupiya-ai-video-1258748690.cos.ap-guangzhou.myqcloud.com',
        port: '',
        pathname: '/**',
      },
    ],
    // 如果 Saleor 返回的 URL 已经被正确重写，不需要 unoptimized
    // 但如果你需要展示未优化的图片（比如开发阶段），可以设置:
    // unoptimized: true,
  },

  // ============================================================
  // 【同源反向代理】解决本地开发 http://localhost:3000 的跨域拦截问题
  // ------------------------------------------------------------
  // 病因：api.coupiya.com / blog.coupiya.com 的 nginx CORS 白名单只放行
  //       coupiya.com、*.vercel.app、dashboard.coupiya.com，
  //       【不包含 http://localhost:3000】。
  //       浏览器直连时预检返回空的 Access-Control-Allow-Origin，
  //       请求被浏览器拦截，前端只看到 "TypeError: Failed to fetch"。
  // 解法：浏览器只访问同源路径，由 Next.js 服务端转发到目标站（服务端无 CORS）。
  //       /api/graphql  → Saleor GraphQL
  //       /api/wp/*     → WordPress REST (wp-json/wp/v2)
  // 生产环境同样适用，且能顺带修好原先 404 的 /api/graphql 调用。
  // ============================================================
  async rewrites() {
    return [
      {
        source: '/api/graphql',
        destination: 'https://api.coupiya.com/saleor/graphql/',
      },
      {
        source: '/api/wp/:path*',
        destination: 'https://blog.coupiya.com/wp-json/wp/v2/:path*',
      },
    ];
  },

  // 跨域请求头
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
