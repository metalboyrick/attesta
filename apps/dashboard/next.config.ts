import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Self-contained server for the Docker image (see Dockerfile).
  output: "standalone",
  serverExternalPackages: ["@solana/web3.js"],
};

export default config;
