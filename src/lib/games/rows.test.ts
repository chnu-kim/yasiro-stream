import { describe, expect, it } from "vitest";
import { copyVod, rowsToRecords, rowToRecord, sortByDate, sortVods, toGame, toSnapshot, GAME_COLUMNS, VOD_COLUMNS } from "./rows.ts";
import type { GameRow, VodRow } from "./types.ts";

const row = (over: Partial<GameRow> = {}): GameRow => ({
  id: "a",
  name: "가",
  original_title: null,
  category_id: null,
  poster_url: null,
  first_played: null,
  last_played: null,
  status: "unknown",
  hidden: 0,
  version: 1,
  created_at: 10,
  updated_at: 20,
  updated_by_name: "시스템",
  ...over,
});
const vod = (game_id: string, n: number, date: string, position: number): VodRow => ({
  game_id,
  video_id: `vid${String(n).padStart(8, "0")}`,
  url: `https://youtu.be/vid${String(n).padStart(8, "0")}`,
  title: `t${n}`,
  date,
  position,
  highlight_start: null,
});

describe("rowToRecord", () => {
  it("maps nulls to omitted optional keys and 0/1 to boolean", () => {
    const r = rowToRecord(row(), []);
    expect(r).toEqual({ id: "a", name: "가", firstPlayed: null, status: "unknown", vods: [], hidden: false, version: 1, createdAt: 10, updatedAt: 20, updatedByName: "시스템" });
    expect("originalTitle" in r || "categoryId" in r || "posterUrl" in r).toBe(false);
  });
  it("keeps present optional fields and hidden=1", () => {
    const r = rowToRecord(row({ original_title: "A", category_id: "C", poster_url: "https://x.pstatic.net/p.png", hidden: 1, first_played: "2026-01-02", status: "clear", updated_by_name: "관리자" }), []);
    expect(r).toMatchObject({ originalTitle: "A", categoryId: "C", posterUrl: "https://x.pstatic.net/p.png", hidden: true, firstPlayed: "2026-01-02", status: "clear", updatedByName: "관리자" });
  });
  it("copies vods without game_id/video_id/position", () => {
    expect(rowToRecord(row(), [vod("a", 1, "2026-01-01", 0)]).vods).toEqual([{ title: "t1", url: "https://youtu.be/vid00000001", date: "2026-01-01" }]);
  });
});

describe("rowsToRecords", () => {
  it("groups vods per game, keeps game order, orders by date then position", () => {
    const out = rowsToRecords(
      [row({ id: "b" }), row({ id: "a" }), row({ id: "c" })],
      [vod("a", 3, "2026-02-01", 2), vod("b", 9, "2026-01-01", 0), vod("a", 2, "2026-01-01", 1), vod("a", 1, "2026-01-01", 0)],
    );
    expect(out.map((g) => g.id)).toEqual(["b", "a", "c"]);
    expect(out[1].vods.map((v) => v.title)).toEqual(["t1", "t2", "t3"]);
    expect(out[0].vods).toHaveLength(1);
    expect(out[2].vods).toEqual([]);
  });
  it("sorts by date before position", () => {
    const out = rowsToRecords([row()], [vod("a", 1, "2026-03-01", 0), vod("a", 2, "2026-01-01", 1)]);
    expect(out[0].vods.map((v) => v.title)).toEqual(["t2", "t1"]);
  });
  it("orders any input permutation the same way", () => {
    const vs = [vod("a", 1, "2026-01-01", 0), vod("a", 2, "2026-01-01", 1), vod("a", 3, "2026-02-01", 2), vod("a", 4, "2026-03-01", 3)];
    for (const perm of [vs, [...vs].reverse(), [vs[2], vs[0], vs[3], vs[1]]]) {
      expect(rowsToRecords([row()], perm)[0].vods.map((v) => v.title)).toEqual(["t1", "t2", "t3", "t4"]);
    }
  });
  it("ignores vods of unknown games", () => {
    expect(rowsToRecords([row()], [vod("zz", 1, "2026-01-01", 0)])[0].vods).toEqual([]);
  });
});

describe("sortVods", () => {
  it("is a stable date sort that drops extra keys", () => {
    const v = (title: string, date: string) => ({ title, url: "u", date, extra: 1 });
    expect(sortVods([v("x", "2026-02-01"), v("y", "2026-01-01"), v("z", "2026-01-01")])).toEqual([
      { title: "y", url: "u", date: "2026-01-01" },
      { title: "z", url: "u", date: "2026-01-01" },
      { title: "x", url: "u", date: "2026-02-01" },
    ]);
  });
  it("handles later-then-earlier comparisons both ways", () => {
    expect(sortVods([{ title: "a", url: "u", date: "2026-01-01" }, { title: "b", url: "u", date: "2026-03-01" }]).map((x) => x.title)).toEqual(["a", "b"]);
  });
});

describe("toGame / toSnapshot", () => {
  const rec = rowToRecord(row({ original_title: "A", category_id: "C", poster_url: "https://x.pstatic.net/p.png", hidden: 1, updated_by_name: "관리자" }), [vod("a", 1, "2026-01-01", 0)]);
  it("toGame strips admin meta", () => {
    const g = toGame(rec);
    expect(Object.keys(g).sort()).toEqual(["categoryId", "firstPlayed", "id", "name", "originalTitle", "posterUrl", "status", "vods"]);
    expect(g.vods).not.toBe(rec.vods);
  });
  it("toGame omits absent optionals", () => {
    expect(Object.keys(toGame(rowToRecord(row(), []))).sort()).toEqual(["firstPlayed", "id", "name", "status", "vods"]);
  });
  it("toSnapshot adds hidden and no actor info", () => {
    const s = toSnapshot(rec, true);
    expect(s.hidden).toBe(true);
    expect(JSON.stringify(s)).not.toMatch(/updatedBy|관리자|version/);
  });
});

describe("하이라이트(highlight_start)", () => {
  it("VOD_COLUMNS에 highlight_start가 있다", () => {
    expect(VOD_COLUMNS.split(", ")).toContain("highlight_start");
  });
  it("rowToRecord: NULL이면 키 없음, 값이면 숫자(0 포함)", () => {
    const r = rowToRecord(row(), [vod("a", 1, "2026-01-01", 0), { ...vod("a", 2, "2026-01-02", 1), highlight_start: 0 }, { ...vod("a", 3, "2026-01-03", 2), highlight_start: 5025 }]);
    expect("highlightStart" in r.vods[0]).toBe(false);
    expect(r.vods[1].highlightStart).toBe(0);
    expect(r.vods[2]).toEqual({ title: "t3", url: "https://youtu.be/vid00000003", date: "2026-01-03", highlightStart: 5025 });
  });
  it("copyVod: 여분 키를 버리고 highlightStart(0 포함)는 유지한다", () => {
    const extra = { title: "a", url: "u", date: "2026-01-01", highlight: "1:00", extra: 1 } as unknown as Parameters<typeof copyVod>[0];
    expect(copyVod(extra)).toEqual({ title: "a", url: "u", date: "2026-01-01" });
    expect(copyVod({ title: "a", url: "u", date: "2026-01-01", highlightStart: 0 })).toEqual({ title: "a", url: "u", date: "2026-01-01", highlightStart: 0 });
    expect(Object.keys(copyVod({ highlightStart: 1, date: "d", url: "u", title: "t" }))).toEqual(["title", "url", "date", "highlightStart"]);
  });
  it("sortByDate: 안정 정렬, 원소 동일성 유지, 새 배열", () => {
    const a = { date: "2026-02-01", k: 1 };
    const b = { date: "2026-01-01", k: 2 };
    const c = { date: "2026-01-01", k: 3 };
    const input = [a, b, c];
    const out = sortByDate(input);
    expect(out).toEqual([b, c, a]);
    expect(out[0]).toBe(b);
    expect(out).not.toBe(input);
    expect(input).toEqual([a, b, c]);
  });
  it("sortVods는 highlightStart를 유지한다", () => {
    expect(sortVods([{ title: "b", url: "u", date: "2026-02-01", highlightStart: 7 }, { title: "a", url: "u", date: "2026-01-01" }])).toEqual([
      { title: "a", url: "u", date: "2026-01-01" },
      { title: "b", url: "u", date: "2026-02-01", highlightStart: 7 },
    ]);
  });
  it("toGame·toSnapshot이 highlightStart를 담는다", () => {
    const rec = rowToRecord(row(), [{ ...vod("a", 1, "2026-01-01", 0), highlight_start: 90 }]);
    expect(toGame(rec).vods[0].highlightStart).toBe(90);
    expect(JSON.parse(JSON.stringify(toSnapshot(rec, false))).vods[0].highlightStart).toBe(90);
  });
});

describe("마지막 플레이 보정값(last_played, 0014)", () => {
  it("GAME_COLUMNS가 last_played를 SELECT한다", () => {
    expect(GAME_COLUMNS.split(", ")).toContain("last_played");
  });
  it("rowToRecord: NULL이면 키가 없고, 값이 있으면 lastPlayed", () => {
    expect("lastPlayed" in rowToRecord(row(), [])).toBe(false);
    expect(rowToRecord(row({ first_played: "2025-01-01", last_played: "2026-02-02" }), []).lastPlayed).toBe("2026-02-02");
  });
  it("toGame·toSnapshot은 담는다", () => {
    const rec = rowToRecord(row({ last_played: "2026-02-02" }), []);
    expect(toGame(rec)).toEqual({ id: "a", name: "가", firstPlayed: null, status: "unknown", vods: [], lastPlayed: "2026-02-02" });
    expect(toSnapshot(rec, false).lastPlayed).toBe("2026-02-02");
  });
});
