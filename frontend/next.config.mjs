/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NEXT_EXPORT === 'true' ? { output: 'export' } : {}),
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
