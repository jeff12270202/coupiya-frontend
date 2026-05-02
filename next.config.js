const nextConfig = {
  transpilePackages: ['@apollo/client'],
  async rewrites() {
    return [
      {
        source: '/api/graphql',
        destination: 'https://api.coupiya.com/saleor/graphql/',
      },
      {
        source: '/api/ai/:path*',
        destination: 'https://api.coupiya.com/ai/:path*',
      },
      // 删除 thumbnail rewrite，因为前端会统一转换为 /media/
    ];
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.coupiya.com',
      },
      // 如果还有本地占位图，可以保留 localhost 模式（开发环境）
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
      },
    ],
  },
};