import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ts-expect-error: Next.js 16 types might be missing root serverActions but it is required for runtime
  serverActions: {
    bodySizeLimit: '50mb',
  },
};

export default nextConfig;
