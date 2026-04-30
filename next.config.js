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
      {
        source: '/thumbnail/:path*',
        destination: 'https://api.coupiya.com/thumbnail/:path*',
      }
    ];
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '43.166.132.156',
        port: '9002',
        pathname: '/saleor-media/**',
      },
      {
        protocol: 'https',
        hostname: 'api.coupiya.com',
      },
      // 移除了 43.166.132.156:9001 因为不是图片服务端口
    ],
  },
};

module.exports = nextConfig;