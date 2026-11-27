import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // next dev가 AGENTS.md를 만들지 않게 한다. 같은 안내(node_modules/next/dist/docs 먼저 읽기)는 CLAUDE.md 'Next.js 16 주의'에 있다
  agentRules: false,
  // 방명록(/to-yasiro)은 2026-11에 없앴다. 검색엔진에 남은 주소는 홈으로 영구 이동
  async redirects() {
    return [{ source: '/to-yasiro', destination: '/', permanent: true }];
  },
};

export default nextConfig;
