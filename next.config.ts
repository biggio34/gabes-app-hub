import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["@libsql/client"],
  // CONTEXT exists only while Netlify builds. Inlining it lets the preview
  // test login see deploy-preview / branch-deploy inside the server function.
  env: {
    NETLIFY_CONTEXT: process.env.CONTEXT ?? "",
  },
};

export default nextConfig;
