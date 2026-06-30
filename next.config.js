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
    ];
  },
  images: {
    unoptimized: true, // 使用 Next.js 默认优化即可
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'media.coupiya.com',
      },
      {
        protocol: 'https',
        hostname: 'api.coupiya.com',
      },
      {
        protocol: 'https',
        hostname: 'blog.coupiya.com',
      },
    ],
  },
};

module.exports = nextConfig;