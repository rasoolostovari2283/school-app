/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
