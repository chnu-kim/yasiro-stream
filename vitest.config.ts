import { defineConfig } from "vitest/config";

// thresholds 키가 100% 강제 대상의 정본이다. test-d1.ts는 테스트 전용 D1 대역(node:sqlite)이라 제외한다(자체 동작은 test-d1.test.ts로 확인).
const FULL = { lines: 100, branches: 100, functions: 100, statements: 100 };

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts", "src/lib/**/types.ts", "src/lib/games/test-d1.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        "src/lib/games/**": FULL,
        "src/lib/awards/**": FULL,
        "src/lib/chzzk-category.ts": FULL,
        "src/lib/session.ts": FULL,
        "src/lib/auth-routes.ts": FULL,
        "src/lib/chzzk-auth.ts": FULL,
        // 페이지 전환(홈 ↔ 소개 캐릭터 이동, 순차 등장 레이어). 연출 순서·계산은 컴포넌트가 아니라 여기서 검증한다
        "src/lib/hero-morph.ts": FULL,
        "src/lib/page-transition.ts": FULL,
        // CSS Module keyframe 검사(모든 *.module.css를 css-keyframes.test.ts가 훑는다)
        "src/lib/css-keyframes.ts": FULL,
      },
    },
  },
});
