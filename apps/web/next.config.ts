import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@freight/schema", "@freight/db", "@freight/operator"],
  serverExternalPackages: ["pg"],
  // Playwright and local curl hit the dev server as 127.0.0.1. Next.js 16
  // blocks those dev resources unless the host is listed.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false,
};

export default nextConfig;
