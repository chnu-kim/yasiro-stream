import { describe, expect, it } from "vitest";
import { coverCrop, orbitItems, stageTextureUrl } from "./orbit.ts";

const P = (id: string) => ({ id, name: id, posterUrl: `https://nng-phinf.pstatic.net/${id}.png`, vods: [] });
const V = (id: string) => ({
  id,
  name: id,
  vods: [{ url: "https://www.youtube.com/watch?v=abcdefghijk", title: `${id} 했어요`, date: "2026-01-02" }],
});
const NONE = (id: string) => ({ id, name: id, vods: [] });

describe("orbitItems", () => {
  it("그림 없는 후보는 빼고, 포스터 먼저 그다음 현장 사진", () => {
    const items = orbitItems([V("v1"), NONE("n1"), P("p1"), P("p2")], 10);
    expect(items.map((i) => i.id)).toEqual(["p1", "p2", "v1"]);
    expect(items.map((i) => i.angle)).toEqual([60, 180, 300]);
    expect(items[2].url).toContain("i.ytimg.com");
  });
  it("포스터가 충분하면 포스터만, 목록 전체에서 고르게 뽑는다", () => {
    const entries = [...Array.from({ length: 8 }, (_, i) => P(`p${i}`)), V("v")];
    const items = orbitItems(entries, 4);
    expect(items.map((i) => i.id)).toEqual(["p0", "p2", "p4", "p6"]);
    expect(items.map((i) => i.angle)).toEqual([45, 135, 225, 315]);
  });
  it("그림이 하나도 없거나 max가 0이면 빈 궤도", () => {
    expect(orbitItems([NONE("a")], 5)).toEqual([]);
    expect(orbitItems([P("a")], 0)).toEqual([]);
  });
});

describe("stageTextureUrl", () => {
  it("치지직 포스터만 같은 출처 중계로", () => {
    expect(stageTextureUrl("https://nng-phinf.pstatic.net/a b.png")).toBe("/api/awards/poster?u=https%3A%2F%2Fnng-phinf.pstatic.net%2Fa%20b.png");
    expect(stageTextureUrl("https://shared.akamai.steamstatic.com/x.jpg")).toBe("https://shared.akamai.steamstatic.com/x.jpg");
    expect(stageTextureUrl("https://i.ytimg.com/vi/abc/hqdefault.jpg")).toBe("https://i.ytimg.com/vi/abc/hqdefault.jpg");
  });
});

describe("coverCrop", () => {
  it("넓은 그림(16:9)은 양옆을, 좁은 그림(2:3)은 위아래를 잘라 3:4를 채운다", () => {
    const wide = coverCrop(1600, 900, 3 / 4);
    expect(wide.repeatY).toBe(1);
    expect(wide.repeatX).toBeCloseTo(0.421875);
    expect(wide.offsetX).toBeCloseTo((1 - 0.421875) / 2);
    const tall = coverCrop(600, 900, 3 / 4);
    expect(tall.repeatX).toBe(1);
    expect(tall.repeatY).toBeCloseTo(8 / 9);
    expect(tall.offsetY).toBeCloseTo(1 / 18);
    expect(coverCrop(300, 400, 3 / 4)).toEqual({ repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0 });
  });
  it("크기를 모르면 자르지 않는다", () => {
    expect(coverCrop(0, 0, 0.75)).toEqual({ repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0 });
    expect(coverCrop(10, 0, 0.75)).toEqual({ repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0 });
  });
});
