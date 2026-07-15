import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: __dirname,
  },
  images: {
    // Cloudflare Workers has no Vercel image optimizer; serve images as-is.
    unoptimized: true,
  },
};

export default nextConfig;

// Makes Cloudflare bindings/context available during `next dev`.
initOpenNextCloudflareForDev();
