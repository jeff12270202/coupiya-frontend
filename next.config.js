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
      // 注意：不要添加 /thumbnail rewrite，图片全部由前端 normalizeImageUrl 处理
    ];
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.coupiya.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
      },
    ],
  },
};

module.exports = nextConfig;