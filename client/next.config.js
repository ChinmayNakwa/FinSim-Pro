/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: 'http://localhost:8000/:path*',
      },
    ]
  },
  experimental: {
    proxyTimeout: 60000,  // 60 seconds
  }
}

module.exports = nextConfig