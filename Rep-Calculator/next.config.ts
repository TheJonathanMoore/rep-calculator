import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase API route body size limit for large PDF uploads
  // Base64 encoding increases file size by ~33%, so 20MB limit allows ~15MB PDFs
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  // Also configure for API routes
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export default nextConfig;
