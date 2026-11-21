import { describe, expect, it, vi } from "vitest";
import { cryptoRng } from "./rng.ts";

describe("cryptoRng", () => {
  it("Uint32 두 개로 53비트 [0,1) 값을 만든다", () => {
    expect(cryptoRng((a) => a.fill(0))()).toBe(0);
    expect(cryptoRng((a) => a.fill(0xffffffff))()).toBe(1 - 2 ** -53);
    // a의 상위 27비트, b의 상위 26비트
    expect(cryptoRng((a) => {
      a[0] = 1 << 5;
      a[1] = 0;
      return a;
    })()).toBe(2 ** 26 / 2 ** 53);
    expect(cryptoRng((a) => {
      a[0] = 0;
      a[1] = 1 << 6;
      return a;
    })()).toBe(1 / 2 ** 53);
  });

  it("호출마다 길이 2 배열로 소스를 한 번 부른다", () => {
    const source = vi.fn((a: Uint32Array) => a.fill(7));
    const rng = cryptoRng(source);
    rng();
    rng();
    expect(source).toHaveBeenCalledTimes(2);
    for (const [arr] of source.mock.calls) {
      expect(arr).toBeInstanceOf(Uint32Array);
      expect(arr.length).toBe(2);
    }
  });

  it("기본 소스(crypto.getRandomValues)는 [0,1) 값을 돌려준다", () => {
    const rng = cryptoRng();
    for (let i = 0; i < 200; i++) {
      const r = rng();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
});
