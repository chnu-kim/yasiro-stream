import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGamesTestDb, type TestD1 } from "../games/test-d1.ts";
import type { GamesDb } from "../games/types.ts";
import { loadDivisionCandidates, loadRankingRows, readLimitCount, recordRun, tallyRows, type RecordRunInput } from "./repo.ts";
import { DRAW_TTL_SECONDS } from "./token.ts";
import type { Bracket } from "./types.ts";

const NOW = 1_792_900_000;
const DAY = 20_745;
const HASH = "a".repeat(64);
const HASH2 = "b".repeat(64);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// 4강, 부전승 1: a-b, c-(부전승). a 우승: picks [a, a]
const BRACKET: Bracket = { size: 4, slots: ["a", "b", "c", null] };

let d1: TestD1;
beforeEach(() => {
  d1 = createGamesTestDb();
});
afterEach(() => d1.close());

function input(n: number, extra: Partial<RecordRunInput> = {}): RecordRunInput {
  return {
    claims: { drawId: uuid(n), division: "alltime", bracket: BRACKET, thirdPlace: false, issuedAt: NOW - 100, expiresAt: NOW - 100 + DRAW_TTL_SECONDS },
    picks: ["a", "a"],
    championId: "a",
    tally: { a: { wins: 2, losses: 0 }, b: { wins: 0, losses: 1 }, c: { wins: 0, losses: 1 } },
    limit: { day: DAY, keyHash: HASH },
    now: NOW,
    ...extra,
  };
}

const all = (sql: string) => d1.sqlite.prepare(sql).all();

describe("tallyRows", () => {
  it("참가 게임 전부(대진 순서), 우승 c=1, tally에 없는 게임은 0", () => {
    expect(tallyRows(BRACKET, "a", { a: { wins: 2, losses: 0 }, b: { wins: 0, losses: 1 } })).toEqual([
      { g: "a", c: 1, w: 2, l: 0 },
      { g: "b", c: 0, w: 0, l: 1 },
      { g: "c", c: 0, w: 0, l: 0 },
    ]);
  });
});

describe("recordRun", () => {
  it("ok: run·limit·tally를 한 batch로 쓴다", async () => {
    const before = d1.batchCalls();
    expect(await recordRun(d1.db, input(1))).toEqual({ ok: true });
    expect(d1.batchCalls()).toBe(before + 1);
    expect(all("SELECT draw_id, division, size, third_place, champion_id, bracket_json, picks_json, issued_at, submitted_at FROM award_runs")).toEqual([
      {
        draw_id: uuid(1),
        division: "alltime",
        size: 4,
        third_place: 0,
        champion_id: "a",
        bracket_json: JSON.stringify(BRACKET),
        picks_json: '["a","a"]',
        issued_at: NOW - 100,
        submitted_at: NOW,
      },
    ]);
    expect(all("SELECT * FROM award_limits")).toEqual([{ day: DAY, key_hash: HASH, division: "alltime", count: 1 }]);
    expect(all("SELECT game_id, appearances, championships, wins, losses, updated_at FROM award_tally ORDER BY game_id")).toEqual([
      { game_id: "a", appearances: 1, championships: 1, wins: 2, losses: 0, updated_at: NOW },
      { game_id: "b", appearances: 1, championships: 0, wins: 0, losses: 1, updated_at: NOW },
      { game_id: "c", appearances: 1, championships: 0, wins: 0, losses: 1, updated_at: NOW },
    ]);

    // 두 번째 판은 누계에 더한다. 3·4위전 값은 0/1로 저장한다
    const second = input(2, {
      claims: { ...input(2).claims, thirdPlace: true, division: "alltime" },
      championId: "c",
      tally: { c: { wins: 1, losses: 0 } },
      now: NOW + 5,
    });
    expect(await recordRun(d1.db, second)).toEqual({ ok: true });
    expect(all("SELECT third_place FROM award_runs ORDER BY draw_id")).toEqual([{ third_place: 0 }, { third_place: 1 }]);
    expect(all("SELECT count FROM award_limits")).toEqual([{ count: 2 }]);
    expect(all("SELECT game_id, appearances, championships, wins, losses, updated_at FROM award_tally ORDER BY game_id")).toEqual([
      { game_id: "a", appearances: 2, championships: 1, wins: 2, losses: 0, updated_at: NOW + 5 },
      { game_id: "b", appearances: 2, championships: 0, wins: 0, losses: 1, updated_at: NOW + 5 },
      { game_id: "c", appearances: 2, championships: 1, wins: 1, losses: 1, updated_at: NOW + 5 },
    ]);
    expect(await readLimitCount(d1.db, DAY, HASH, "alltime")).toBe(2);
    expect(await readLimitCount(d1.db, DAY, HASH, "2026")).toBe(0);
    expect(await readLimitCount(d1.db, DAY, HASH2, "alltime")).toBe(0);
  });

  it("duplicate: 같은 draw_id는 전부 롤백", async () => {
    await recordRun(d1.db, input(1));
    expect(await recordRun(d1.db, input(1, { limit: { day: DAY, keyHash: HASH2 } }))).toEqual({ ok: false, reason: "duplicate" });
    expect(all("SELECT count(*) n FROM award_runs")).toEqual([{ n: 1 }]);
    expect(all("SELECT key_hash, count FROM award_limits")).toEqual([{ key_hash: HASH, count: 1 }]);
    expect(all("SELECT sum(appearances) n FROM award_tally")).toEqual([{ n: 3 }]);
  });

  it("limited: 한도가 찼으면 아무것도 쓰지 않는다. 이미 있는 draw_id는 한도와 상관없이 duplicate(누계를 두 번 더하지 않는다)", async () => {
    await recordRun(d1.db, input(1));
    d1.sqlite.prepare("UPDATE award_limits SET count = 10").run();
    expect(await recordRun(d1.db, input(2))).toEqual({ ok: false, reason: "limited" });
    expect(await recordRun(d1.db, input(1))).toEqual({ ok: false, reason: "duplicate" });
    expect(all("SELECT count(*) n FROM award_runs")).toEqual([{ n: 1 }]);
    expect(all("SELECT count FROM award_limits")).toEqual([{ count: 10 }]);
    expect(all("SELECT sum(appearances) n FROM award_tally")).toEqual([{ n: 3 }]);
    // 다른 키·부문은 막히지 않는다
    expect(await recordRun(d1.db, input(3, { limit: { day: DAY, keyHash: HASH2 } }))).toEqual({ ok: true });
  });

  it("마지막 문장이 던지면 전부 롤백하고 에러를 다시 던진다", async () => {
    const db: GamesDb = {
      prepare: (q) => d1.db.prepare(q),
      batch: (s) => d1.db.batch([...s.slice(0, 3), d1.db.prepare("SELECT * FROM no_such_table")]),
    };
    await expect(recordRun(db, input(1))).rejects.toThrow(/no such table/);
    expect(all("SELECT count(*) n FROM award_runs")).toEqual([{ n: 0 }]);
    expect(all("SELECT count(*) n FROM award_limits")).toEqual([{ n: 0 }]);
    // Error가 아닌 값도 그대로 다시 던진다
    const weird: GamesDb = { prepare: (q) => d1.db.prepare(q), batch: () => Promise.reject("UNIQUE constraint failed: award_runs.draw_id") };
    await expect(recordRun(weird, input(1))).rejects.toBe("UNIQUE constraint failed: award_runs.draw_id");
  });

  it("오래된 제한 행: day−2 이전은 지우고 day−1은 남긴다", async () => {
    const ins = d1.sqlite.prepare("INSERT INTO award_limits (day, key_hash, division, count) VALUES (?, ?, 'alltime', 3)");
    ins.run(DAY - 2, HASH2);
    ins.run(DAY - 1, HASH2);
    ins.run(DAY - 30, HASH);
    await recordRun(d1.db, input(1));
    expect(all("SELECT day, count FROM award_limits ORDER BY day")).toEqual([
      { day: DAY - 1, count: 3 },
      { day: DAY, count: 1 },
    ]);
  });
});

describe("loadDivisionCandidates / loadRankingRows", () => {
  const game = (id: string, firstPlayed: string | null, hidden = 0) =>
    d1.sqlite.prepare("INSERT INTO games (id, name, first_played, hidden) VALUES (?, ?, ?, ?)").run(id, `게임${id}`, firstPlayed, hidden);

  it("후보: 숨기지 않은 게임, 2026은 첫 플레이 2026만", async () => {
    game("a", "2026-01-01");
    game("b", "2025-12-31");
    game("c", null);
    game("h", "2026-05-05", 1);
    expect((await loadDivisionCandidates(d1.db, "alltime")).sort()).toEqual(["a", "b", "c"]);
    expect(await loadDivisionCandidates(d1.db, "2026")).toEqual(["a"]);
  });

  it("순위 행: games JOIN hidden=0, 부문 술어, runs는 그 부문 판 수", async () => {
    game("a", "2026-01-01");
    game("b", "2025-12-31");
    game("h", "2026-05-05", 1);
    await recordRun(d1.db, input(1, { claims: { ...input(1).claims, bracket: { size: 4, slots: ["a", "b", "h", "zz"] } }, tally: { a: { wins: 2, losses: 0 } } }));
    await recordRun(d1.db, input(2, { claims: { ...input(2).claims, division: "2026", bracket: { size: 4, slots: ["a", "b", "h", null] } } }));
    const alltime = await loadRankingRows(d1.db, "alltime");
    expect(alltime.runs).toBe(1);
    expect(alltime.rows.sort((x, y) => (x.id < y.id ? -1 : 1))).toEqual([
      { id: "a", appearances: 1, championships: 1, wins: 2, losses: 0 },
      { id: "b", appearances: 1, championships: 0, wins: 0, losses: 0 },
    ]);
    const y2026 = await loadRankingRows(d1.db, "2026");
    expect(y2026).toEqual({ runs: 1, rows: [{ id: "a", appearances: 1, championships: 1, wins: 2, losses: 0 }] });
    expect(await loadRankingRows(createGamesTestDb().db, "alltime")).toEqual({ runs: 0, rows: [] });
  });
});
