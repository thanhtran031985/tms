import path from 'node:path';
import type { NextConfig } from 'next';

// Gốc repo: cho phép đọc designs/tokens.css và packages/* nằm ngoài apps/web.
const repoRoot = path.join(import.meta.dirname, '..', '..');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
};

export default nextConfig;
