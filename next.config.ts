import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The sidebar's bottom-left corner holds its controls; keep the dev badge out of the way.
  devIndicators: { position: "bottom-right" },
  experimental: {
    // File uploads (spec sheets, photos, COAs) go through Server Actions.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
