import { describe, expect, it } from "vitest";
import { coerceSizeChoice, defaultSizeChoice, nextPow2, SIZE_LADDER, sizeEnabled, sizeOptions, thirdPlaceAvailable } from "./options.ts";
import type { SizeOption } from "./types.ts";

describe("상수", () => {
  it("강 사다리는 4·16·32·64·128·256·512·1024(8강 없음, '모두' 없음)", () => {
    expect(SIZE_LADDER).toEqual([4, 16, 32, 64, 128, 256, 512, 1024]);
  });
});

describe("nextPow2", () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 2],
    [3, 4],
    [4, 4],
    [5, 8],
    [128, 128],
    [129, 256],
    [338, 512],
  ])("%i → %i", (n, want) => {
    expect(nextPow2(n)).toBe(want);
  });
});

describe("sizeEnabled", () => {
  it("n >= 2 && B < 2n", () => {
    expect(sizeEnabled(4, 2)).toBe(false);
    expect(sizeEnabled(2, 2)).toBe(true);
    expect(sizeEnabled(4, 3)).toBe(true);
    expect(sizeEnabled(16, 8)).toBe(false);
    expect(sizeEnabled(16, 9)).toBe(true);
    expect(sizeEnabled(2, 1)).toBe(false);
    expect(sizeEnabled(0, 0)).toBe(false);
    expect(sizeEnabled(4, 1000)).toBe(true);
  });
});

/** 표의 한 칸: [size, fit, extra] */
type Cell = [number, SizeOption["fit"], number];

describe("sizeOptions: 후보 수 이상인 가장 작은 2의 거듭제곱(nextPow2)까지만 보인다", () => {
  const table: [number, Cell[]][] = [
    [0, []],
    [2, []],
    [3, [[4, "byes", 1]]],
    [4, [[4, "exact", 0]]],
    [8, [[4, "draw", 4]]],
    [9, [[4, "draw", 5], [16, "byes", 7]]],
    [64, [[4, "draw", 60], [16, "draw", 48], [32, "draw", 32], [64, "exact", 0]]],
    [92, [[4, "draw", 88], [16, "draw", 76], [32, "draw", 60], [64, "draw", 28], [128, "byes", 36]]],
    [128, [[4, "draw", 124], [16, "draw", 112], [32, "draw", 96], [64, "draw", 64], [128, "exact", 0]]],
    [
      338,
      [
        [4, "draw", 334],
        [16, "draw", 322],
        [32, "draw", 306],
        [64, "draw", 274],
        [128, "draw", 210],
        [256, "draw", 82],
        [512, "byes", 174],
      ],
    ],
    [2000, SIZE_LADDER.map((size): Cell => [size, "draw", 2000 - size])],
  ];
  it.each(table)("n=%i", (n, cells) => {
    expect(sizeOptions(n).map((o) => [o.size, o.fit, o.extra])).toEqual(cells);
  });

  it("보이는 강은 모두 sizeEnabled, 숨긴 강은 모두 아님", () => {
    for (let n = 0; n <= 1100; n++) {
      const shown = sizeOptions(n).map((o) => o.size);
      expect(shown).toEqual(SIZE_LADDER.filter((size) => sizeEnabled(size, n)));
    }
  });
});

describe("defaultSizeChoice", () => {
  it.each([
    [0, null],
    [2, null],
    [3, 4],
    [8, 4],
    [9, 16],
    [338, 16],
  ])("n=%i → %s", (n, want) => {
    expect(defaultSizeChoice(n)).toBe(want);
  });
});

describe("coerceSizeChoice", () => {
  it("보이면 그대로, 안 보이면 그보다 작은 것 중 가장 큰 강, 그것도 없으면 기본값", () => {
    expect(coerceSizeChoice(16, 20)).toBe(16);
    expect(coerceSizeChoice(512, 92)).toBe(128);
    expect(coerceSizeChoice(256, 20)).toBe(32);
    expect(coerceSizeChoice(4, 3)).toBe(4);
    expect(coerceSizeChoice(16, 3)).toBe(4);
    expect(coerceSizeChoice(4, 1)).toBe(null);
    expect(coerceSizeChoice(null, 92)).toBe(16);
    expect(coerceSizeChoice(null, 1)).toBe(null);
  });
});

describe("thirdPlaceAvailable", () => {
  it.each([
    [2, 2, false],
    [4, 3, false],
    [4, 4, true],
    [4, 10, true],
    [8, 5, true],
    [16, 9, true],
    [512, 338, true],
  ])("size %i, n %i → %s", (size, n, want) => {
    expect(thirdPlaceAvailable(size, n)).toBe(want);
  });
});
