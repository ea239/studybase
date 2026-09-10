import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) spawns a worker by resolving a file path at
  // runtime; letting the bundler process it breaks that resolution, so it
  // must run as plain Node code instead.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // The dev server is being accessed over the LAN (not localhost). Without
  // this, Next.js blocks dev-only resources (JS chunks, HMR) for that
  // origin, which breaks client-side hydration — inputs still type (native
  // browser behavior) but onClick handlers never attach, so buttons appear
  // to silently do nothing.
  allowedDevOrigins: ["10.38.75.10"],
};

export default nextConfig;
