import { describe, expect, it } from "vitest";
import { MIN_DECIDED_MATCHES, RANKING_LIMIT, rankTally, type TallyRow } from "./rankings.ts";

const row = (id: string, championships: number, wins: number, losses: number, appearances = 1): TallyRow => ({ id, appearances, championships, wins, losses });
const ids = (rows: TallyRow[]) => rows.map((r) => r.id);

describe("rankTally", () => {
  it("상수와 그대로 전달하는 값", () => {
    expect(RANKING_LIMIT).toBe(10);
    expect(MIN_DECIDED_MATCHES).toBe(10);
    expect(rankTally(7, [])).toEqual({ runs: 7, minMatches: 10, byChampionships: [], byWinRate: [] });
  });

  it("우승 횟수: 0회 제외, 우승 → 승률 → 대결 수 → id", () => {
    const rows = [
      row("zero", 0, 50, 0),
      row("b", 2, 4, 1),
      row("a", 3, 1, 9),
      // 우승 2, 승률 4/5와 같음(8/10), 대결 수 더 많음
      row("c", 2, 8, 2),
      // 우승 2, 승률 더 높음
      row("d", 2, 9, 1),
      // id 동률 단계: e·f는 모두 같고 id 순
      row("f", 1, 1, 1),
      row("e", 1, 1, 1),
    ];
    expect(ids(rankTally(1, rows).byChampionships)).toEqual(["a", "d", "c", "b", "e", "f"]);
  });

  it("승률: 대결 9판은 제외, 10판부터. 승률 → 대결 수 → 우승 → id", () => {
    const rows = [
      row("nine", 5, 9, 0),
      row("ten", 0, 5, 5),
      // 1/2 vs 2/4 교차곱 동률 → 대결 수
      row("half20", 0, 10, 10),
      row("full", 0, 10, 0),
      row("p70", 0, 7, 3),
      // 대결 수·승률 같으면 우승 많은 쪽
      row("p70c", 2, 7, 3),
      // 모두 같으면 id
      row("p70b", 0, 7, 3),
    ];
    expect(ids(rankTally(1, rows).byWinRate)).toEqual(["full", "p70c", "p70", "p70b", "half20", "ten"]);
  });

  it("0판(0/0)끼리도 비교가 깨지지 않는다(우승 목록)", () => {
    expect(ids(rankTally(1, [row("y", 1, 0, 0), row("x", 1, 0, 0), row("w", 1, 1, 0)]).byChampionships)).toEqual(["w", "x", "y"]);
  });

  it("RANKING_LIMIT개로 자르고 입력을 바꾸지 않는다", () => {
    const rows = Array.from({ length: 15 }, (_, i) => row(`g${String(i).padStart(2, "0")}`, 15 - i, 10 + i, 0));
    const copy = structuredClone(rows);
    const r = rankTally(3, rows);
    expect(r.byChampionships).toHaveLength(10);
    expect(r.byChampionships[0].id).toBe("g00");
    expect(r.byWinRate).toHaveLength(10);
    expect(r.byWinRate[0].id).toBe("g14");
    expect(rows).toEqual(copy);
  });
});
