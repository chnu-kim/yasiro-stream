import { describe, expect, it } from "vitest";
import { byeMatches, drawBracket, shuffle } from "./draw.ts";
import { nextPow2, sizeEnabled, sizeOptions } from "./options.ts";

/** 테스트용 시드 PRNG(mulberry32). 커버리지 대상 밖에 두려고 테스트 파일 안에 둔다 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function counted(value: number): { rng: () => number; calls: () => number } {
  let n = 0;
  return {
    rng: () => {
      n++;
      return value;
    },
    calls: () => n,
  };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `g${String(i).padStart(3, "0")}`);

describe("shuffle", () => {
  it("rng 0 고정: [a,b,c,d] → [b,c,d,a]", () => {
    expect(shuffle(["a", "b", "c", "d"], () => 0)).toEqual(["b", "c", "d", "a"]);
  });

  it("rng가 1에 가까우면 j = i라 입력 그대로", () => {
    expect(shuffle(["a", "b", "c", "d"], () => 0.999999)).toEqual(["a", "b", "c", "d"]);
  });

  it("계약 위반 1·Infinity도 범위를 넘지 않는다(clamp)", () => {
    expect(shuffle(["a", "b", "c"], () => 1)).toEqual(["a", "b", "c"]);
    expect(shuffle(["a", "b", "c"], () => Infinity)).toEqual(["a", "b", "c"]);
  });

  it("음수·NaN은 RangeError", () => {
    expect(() => shuffle(["a", "b"], () => -0.1)).toThrow(RangeError);
    expect(() => shuffle(["a", "b"], () => NaN)).toThrow(RangeError);
  });

  it("입력을 바꾸지 않고 새 배열을 준다. 호출 횟수 = len−1", () => {
    const input = ["a", "b", "c", "d", "e"];
    const c = counted(0.3);
    const out = shuffle(input, c.rng);
    expect(input).toEqual(["a", "b", "c", "d", "e"]);
    expect(out).not.toBe(input);
    expect([...out].sort()).toEqual(input);
    expect(c.calls()).toBe(4);
  });

  it("길이 0·1은 rng를 부르지 않고 새 배열", () => {
    for (const input of [[], ["a"]]) {
      const c = counted(0.5);
      const out = shuffle(input, c.rng);
      expect(out).toEqual(input);
      expect(out).not.toBe(input);
      expect(c.calls()).toBe(0);
    }
  });
});

describe("byeMatches", () => {
  it.each<[number, number, number[]]>([
    [1, 0, []],
    [2, 1, [0]],
    [8, 5, [0, 4, 2, 6, 1]],
    [8, 0, []],
    [4, 3, [0, 2, 1]],
    [8, 7, [0, 4, 2, 6, 1, 5, 3]],
  ])("(%i, %i)", (m, k, want) => {
    expect(byeMatches(m, k)).toEqual(want);
  });

  it("잘못된 인자는 RangeError", () => {
    expect(() => byeMatches(0, 0)).toThrow(RangeError);
    expect(() => byeMatches(6, 1)).toThrow(RangeError);
    expect(() => byeMatches(1.5, 0)).toThrow(RangeError);
    expect(() => byeMatches(4, 4)).toThrow(RangeError);
    expect(() => byeMatches(4, -1)).toThrow(RangeError);
    expect(() => byeMatches(4, 1.5)).toThrow(RangeError);
  });

  it("양쪽 절반·사분면의 부전승 수 차이가 1 이하", () => {
    for (const m of [2, 4, 8, 16, 32, 64, 128, 256]) {
      for (let k = 0; k < m; k++) {
        const set = new Set(byeMatches(m, k));
        expect(set.size).toBe(k);
        for (const parts of [2, 4]) {
          if (parts > m) continue;
          const w = m / parts;
          const counts = Array.from({ length: parts }, (_, p) => {
            let c = 0;
            for (let i = p * w; i < (p + 1) * w; i++) if (set.has(i)) c++;
            return c;
          });
          expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("drawBracket", () => {
  it("예시: [c,a,b], 4강, rng 0 → [b,null,c,a]", () => {
    expect(drawBracket(["c", "a", "b"], 4, () => 0)).toEqual({ size: 4, slots: ["b", null, "c", "a"] });
  });

  it("입력 순서와 무관하게 같은 rng 열이면 같은 대진", () => {
    const a = ids(40);
    const b = [...a].reverse();
    expect(drawBracket(a, 16, mulberry32(7))).toEqual(drawBracket(b, 16, mulberry32(7)));
    expect(drawBracket(a, 64, mulberry32(9))).toEqual(drawBracket(b, 64, mulberry32(9)));
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const input = ["c", "a", "b"];
    drawBracket(input, 4, () => 0);
    expect(input).toEqual(["c", "a", "b"]);
  });

  it("n=338, 16강: 16칸 모두 게임, 중복 없음, 모두 후보", () => {
    const all = ids(338);
    const { slots } = drawBracket(all, 16, mulberry32(1));
    expect(slots).toHaveLength(16);
    expect(slots.every((s) => s !== null)).toBe(true);
    expect(new Set(slots).size).toBe(16);
    expect(slots.every((s) => all.includes(s as string))).toBe(true);
  });

  it("n=11, 16강: 부전승 5개가 매치 {0,4,2,6,1}의 1번 칸", () => {
    const { slots } = drawBracket(ids(11), 16, mulberry32(3));
    const nulls = slots.flatMap((s, i) => (s === null ? [i] : []));
    expect(nulls).toEqual([1, 3, 5, 9, 13]);
    for (const i of nulls) expect(slots[i - 1]).not.toBeNull();
  });

  it("던짐: 2의 거듭제곱이 아닌 강, 1강, 중복 id, 고를 수 없는 강", () => {
    expect(() => drawBracket(ids(5), 6, () => 0)).toThrow(RangeError);
    expect(() => drawBracket(ids(5), 1, () => 0)).toThrow(RangeError);
    expect(() => drawBracket(ids(5), 0, () => 0)).toThrow(RangeError);
    expect(() => drawBracket(["a", "b", "a"], 4, () => 0)).toThrow(RangeError);
    expect(() => drawBracket(ids(2), 4, () => 0)).toThrow(RangeError);
    expect(() => drawBracket(ids(1), 2, () => 0)).toThrow(RangeError);
    expect(() => drawBracket([], 2, () => 0)).toThrow(RangeError);
  });

  it("성질: 모든 N(2..300) × 모든 활성 강", () => {
    const rng = mulberry32(2026);
    for (let n = 2; n <= 300; n++) {
      const all = ids(n);
      // 화면에 보이는 강(sizeOptions)에 엔진이 받는 나머지 2의 거듭제곱(2·8강)도 더해 본다
      const sizes = new Set([...sizeOptions(n).map((o) => o.size), ...[2, 8, nextPow2(n)].filter((s) => sizeEnabled(s, n))]);
      expect(sizes.has(nextPow2(n))).toBe(true);
      for (const size of sizes) {
        const { size: got, slots } = drawBracket(all, size, rng);
        expect(got).toBe(size);
        expect(slots).toHaveLength(size);
        const nulls = slots.filter((s) => s === null).length;
        expect(nulls).toBe(Math.max(0, size - n));
        for (let i = 0; i < size / 2; i++) {
          // 0번 칸은 언제나 게임 → 부전승끼리 붙지 않는다
          expect(slots[2 * i]).not.toBeNull();
        }
        const games = slots.filter((s): s is string => s !== null);
        expect(new Set(games).size).toBe(games.length);
        expect(games.length).toBe(Math.min(n, size));
        expect(games.every((g) => all.includes(g))).toBe(true);
      }
    }
  }, 30_000); // 전수 검사라 커버리지 계측(pnpm test:coverage) 아래에서 기본 5초를 넘길 수 있다
});
