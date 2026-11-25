import { describe, expect, it } from "vitest";
import { DEFAULT_QUERY_STATE, indexWithHidden, selectGames } from "./query.ts";
import { diaryMonths, yearChapters } from "./years.ts";
import type { Game, GamesQueryState, GameStatus } from "./types.ts";

function g(id: string, firstPlayed: string | null, status: GameStatus): Game {
  return { id, name: id, firstPlayed, status, vods: [] };
}

const games: Game[] = [
  g("a26", "2026-10-21", "clear"),
  g("b26", "2026-03-02", "fail"),
  g("c25", "2025-12-30", "clear"),
  g("d25", "2025-08-01", "clear"),
  g("e25", "2025-02-11", "unknown"),
  g("f24", "2024-06-06", "endless"),
  g("n1", null, "clear"),
  g("n2", null, "unknown"),
];

const st = (patch: Partial<GamesQueryState>): GamesQueryState => ({ ...DEFAULT_QUERY_STATE, ...patch });
const run = (state: GamesQueryState, source: readonly Game[] = games) => yearChapters(selectGames(source, state), state);

describe("yearChapters", () => {
  it("이름순이면 챕터로 나누지 않는다", () => {
    expect(run(st({ sort: "name" }))).toBeNull();
  });

  it("최신순: 연도 내림차순, 날짜 없는 게임은 맨 뒤 한 챕터. 챕터 번호는 01부터", () => {
    const chapters = run(st({}))!;
    expect(chapters.map((x) => [x.no, x.key])).toEqual([
      ["01", "2026"],
      ["02", "2025"],
      ["03", "2024"],
      ["04", "none"],
    ]);
    expect(chapters.map((x) => x.items.map((i) => i.id))).toEqual([
      ["a26", "b26"],
      ["c25", "d25", "e25"],
      ["f24"],
      ["n1", "n2"],
    ]);
    expect(chapters[0]).toMatchObject({ kind: "year", heading: "2026", count: 2, clear: 1, countText: "2개 · 정복 1" });
    expect(chapters[3]).toMatchObject({ kind: "none", heading: "날짜 기록 없음", count: 2, clear: 1 });
  });

  it("오래된순: 연도 오름차순, 날짜 없는 게임은 여전히 맨 뒤", () => {
    const chapters = run(st({ sort: "old" }))!;
    expect(chapters.map((x) => x.key)).toEqual(["2024", "2025", "2026", "none"]);
    expect(chapters[1].items.map((i) => i.id)).toEqual(["e25", "d25", "c25"]);
  });

  it("정복 0인 연도도 0으로 적는다", () => {
    expect(run(st({}))![2].countText).toBe("1개 · 정복 0");
  });

  it("검색·연도 필터 결과만 챕터가 된다", () => {
    expect(run(st({ year: "2025" }))!.map((x) => [x.key, x.count])).toEqual([["2025", 3]]);
    expect(run(st({ q: "n" }))!.map((x) => [x.no, x.key, x.count])).toEqual([["01", "none", 2]]);
  });

  it("상태 필터가 걸리면 정복 수를 적지 않는다", () => {
    expect(run(st({ status: "clear" }))!.map((x) => [x.key, x.countText])).toEqual([
      ["2026", "1개"],
      ["2025", "2개"],
      ["none", "1개"],
    ]);
  });

  it("결과가 없으면 빈 배열", () => {
    expect(run(st({ q: "없는게임" }))).toEqual([]);
  });

  it("관리자 숨김 보기: 숨긴 게임도 넘겨받은 목록 그대로 그 연도에 센다", () => {
    const withHidden = indexWithHidden([
      ...games.map((x) => ({ ...x, hidden: false })),
      { ...g("h25", "2025-05-05", "clear"), hidden: true },
    ]);
    const y25 = yearChapters(selectGames(withHidden, st({})), st({}))!.find((x) => x.key === "2025")!;
    expect(y25.count).toBe(4);
    expect(y25.clear).toBe(3);
    expect(y25.items.find((i) => i.id === "h25")!.no).toBe("—");
  });
});

describe("diaryMonths", () => {
  const items = [
    g("a", "2026-11-20", "clear"),
    g("b", "2026-11-20", "clear"),
    g("c", "2026-11-19", "fail"),
    g("d", "2026-10-30", "clear"),
    g("e", "2025-10-02", "clear"),
    g("n", null, "unknown"),
  ];

  it("월마다 묶고, 같은 날이 이어지면 날짜는 첫 줄에만 적는다", () => {
    const months = diaryMonths(items);
    expect(months.map((m) => m.key)).toEqual(["2026-11", "2026-10", "2025-10", "none"]);
    expect(months[0]).toMatchObject({ kind: "month", month: "NOV", year: "2026", label: "2026년 11월" });
    expect(months[0].rows.map((r) => [r.game.id, r.day])).toEqual([
      ["a", "20"],
      ["b", null],
      ["c", "19"],
    ]);
  });

  it("다른 달로 넘어가면 같은 날짜 숫자라도 다시 적는다", () => {
    const months = diaryMonths([g("x", "2026-11-02", "clear"), g("y", "2026-10-02", "clear")]);
    expect(months.map((m) => m.rows[0].day)).toEqual(["02", "02"]);
  });

  it("날짜 없는 게임은 한 묶음이고 날짜 칸이 비어 있다", () => {
    const none = diaryMonths(items).at(-1)!;
    expect(none).toMatchObject({ kind: "none", month: null, year: null, label: "날짜 기록 없음" });
    expect(none.rows).toEqual([{ game: items[5], day: null }]);
  });

  it("빈 목록은 빈 배열", () => {
    expect(diaryMonths([])).toEqual([]);
  });
});
