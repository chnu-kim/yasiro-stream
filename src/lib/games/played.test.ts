import { describe, expect, it } from "vitest";
import { earliestPlayedOf, lastPlayedOf, playedInYear, type PlayedDates } from "./played.ts";

type Row = [firstPlayed: string | null, vods: string[], lastPlayed: string | undefined, last: string | null, earliest: string | null, in2026: boolean];

// 설계 표(2절) 그대로. year = "2026"
const TABLE: Row[] = [
  [null, [], undefined, null, null, false],
  ["2026-03-01", [], undefined, "2026-03-01", "2026-03-01", true],
  ["2025-12-31", [], undefined, "2025-12-31", "2025-12-31", false],
  ["2026-01-01", [], undefined, "2026-01-01", "2026-01-01", true],
  ["2026-12-31", [], undefined, "2026-12-31", "2026-12-31", true],
  ["2027-01-01", [], undefined, "2027-01-01", "2027-01-01", false],
  ["2025-10-01", ["2025-10-01", "2026-02-01"], undefined, "2026-02-01", "2025-10-01", true],
  ["2025-10-01", ["2025-12-31"], undefined, "2025-12-31", "2025-10-01", false],
  ["2025-10-01", ["2026-01-01"], undefined, "2026-01-01", "2025-10-01", true],
  [null, ["2026-04-04"], undefined, "2026-04-04", "2026-04-04", true],
  [null, ["2025-04-04"], undefined, "2025-04-04", "2025-04-04", false],
  ["2024-01-01", [], "2026-01-01", "2026-01-01", "2024-01-01", true],
  [null, [], "2026-05-05", "2026-05-05", "2026-05-05", true],
  ["2025-05-01", ["2025-06-01"], "2025-12-31", "2025-12-31", "2025-05-01", false],
  ["2025-05-01", [], "2027-02-01", "2027-02-01", "2025-05-01", true],
  ["2026-02-01", ["2026-03-01"], "2026-02-15", "2026-03-01", "2026-02-01", true],
  ["2026-01-02", ["2026-05-01", "2026-01-02"], undefined, "2026-05-01", "2026-01-02", true],
];

function dates([firstPlayed, vods, lastPlayed]: Row): PlayedDates {
  const g: PlayedDates = { firstPlayed, vods: vods.map((date) => ({ date })) };
  if (lastPlayed !== undefined) g.lastPlayed = lastPlayed;
  return g;
}

describe("played", () => {
  it.each(TABLE.map((r, i) => [i + 1, r] as const))("표 %i", (_, row) => {
    const g = dates(row);
    expect(lastPlayedOf(g)).toBe(row[3]);
    expect(earliestPlayedOf(g)).toBe(row[4]);
    expect(playedInYear(g, "2026")).toBe(row[5]);
  });

  it("첫 플레이가 2026이면 2026에 한 게임이다(옛 부문 규칙의 상위 집합)", () => {
    for (const row of TABLE) {
      const g = dates(row);
      if (g.firstPlayed?.startsWith("2026")) expect(playedInYear(g, "2026")).toBe(true);
    }
  });

  it("입력을 바꾸지 않는다", () => {
    const g: PlayedDates = { firstPlayed: "2026-01-01", lastPlayed: "2026-02-02", vods: [{ date: "2026-01-05" }] };
    const before = JSON.stringify(g);
    lastPlayedOf(g);
    earliestPlayedOf(g);
    expect(JSON.stringify(g)).toBe(before);
  });
});
