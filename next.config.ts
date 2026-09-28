import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // File uploads (spec sheets, photos, COAs) go through Server Actions.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
