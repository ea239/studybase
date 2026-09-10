import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) spawns a worker by resolving a file path at
  // runtime; letting the bundler process it breaks that resolution, so it
  // must run as plain Node code instead.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
