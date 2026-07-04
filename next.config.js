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
    ],
    // 如果 Saleor 返回的 URL 已经被正确重写，不需要 unoptimized
    // 但如果你需要展示未优化的图片（比如开发阶段），可以设置:
    // unoptimized: true,
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
