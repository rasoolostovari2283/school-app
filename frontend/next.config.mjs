/** @type {import('next').NextConfig} */
const isExport = process.env.NEXT_EXPORT === 'true' || !process.env.BACKEND_INTERNAL_URL;

const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  ...(isExport
    ? { output: 'export' }
    : {
        async rewrites() {
          const backendOrigin = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:5000';
          return [
            {
              source: '/api/:path*',
              destination: `${backendOrigin}/api/:path*`,
            },
            {
              source: '/uploads/:path*',
              destination: `${backendOrigin}/uploads/:path*`,
            },
            {
              source: '/socket.io/:path*',
              destination: `${backendOrigin}/socket.io/:path*`,
            },
          ];
        },
      }),
};

export default nextConfig;
