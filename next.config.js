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
    unoptimized: true,   // 关闭 Vercel 图片优化，解决 502
    remotePatterns: [    // 保留远程模式（虽然 unoptimized 时可能不需要，但保留无害）
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

module.exports = nextConfig;