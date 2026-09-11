import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) spawns a worker by resolving a file path at
  // runtime; letting the bundler process it breaks that resolution, so it
  // must run as plain Node code instead.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // The dev server is reached from other machines (LAN and Tailscale), not
  // just localhost. Without listing those origins, Next.js blocks dev-only
  // resources (JS chunks, HMR) for them, which breaks client-side hydration —
  // inputs still type (native browser behavior) but onClick handlers never
  // attach and effects never run, so buttons do nothing and anything loaded
  // client-side sits on "加载中" forever.
  allowedDevOrigins: [
    "10.38.75.10", // LAN
    "100.126.176.101", // Tailscale IPv4
    "dev-server", // Tailscale MagicDNS short name
    "dev-server.tail3a5cee.ts.net", // Tailscale MagicDNS FQDN
    "*.tail3a5cee.ts.net",
  ],
};

export default nextConfig;
