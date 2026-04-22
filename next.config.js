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
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
      {
        protocol: 'https',
        hostname: 'api.coupiya.com',
      },
      {
        protocol: 'https',
        hostname: '43.166.132.156',
        port: '9001',
        pathname: '/saleor-media/**',
      },
    ],
  },
};

module.exports = {
  images: {
    unoptimized: true,   // 关闭 Vercel 图片优化，直接返回原始 URL
  },
};