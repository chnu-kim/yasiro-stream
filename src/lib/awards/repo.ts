// award_* 테이블(0013) 읽기·쓰기. 제출 하나는 db.batch 한 번(원자적)이다.
// 익명: 제출자 channel_id·채널 이름·IP 원문은 받지도 쓰지도 않는다(제한 키는 HMAC 해시만).
import { gameInDivision } from "./entries.ts";
import { SUBMIT_LIMIT_PER_DAY } from "./limit.ts";
import type { TallyRow } from "./rankings.ts";
import type { DrawClaims } from "./token.ts";
import { listGames } from "../games/repo.ts";
import type { Game, GamesDb } from "../games/types.ts";
import type { Bracket, Division, GameRecordTally } from "./types.ts";

export interface RecordRunInput {
  /** 토큰에서 나온 값 */
  claims: DrawClaims;
  /** verifyRun이 돌려준 state.picks */
  picks: string[];
  championId: string;
  tally: Record<string, GameRecordTally>;
  limit: { day: number; keyHash: string };
  /** unix seconds */
  now: number;
}

export type RecordRunResult = { ok: true } | { ok: false; reason: "duplicate" | "limited" };

export interface TallyJsonRow {
  g: string;
  c: 0 | 1;
  w: number;
  l: number;
}

/** 참가 게임(non-null 칸) 순서대로 누계 증분. tally에 없는 게임은 0승 0패 */
export function tallyRows(bracket: Bracket, championId: string, tally: Record<string, GameRecordTally>): TallyJsonRow[] {
  return bracket.slots
    .filter((s): s is string => s !== null)
    .map((g) => ({ g, c: g === championId ? 1 : 0, w: tally[g]?.wins ?? 0, l: tally[g]?.losses ?? 0 }));
}

const DELETE_OLD_LIMITS = "DELETE FROM award_limits WHERE day < ?";

const INSERT_RUN = `INSERT INTO award_runs (draw_id, division, size, third_place, champion_id, bracket_json, picks_json, issued_at, submitted_at)
SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
WHERE COALESCE((SELECT count FROM award_limits WHERE day = ? AND key_hash = ? AND division = ?), 0) < ?
   OR EXISTS (SELECT 1 FROM award_runs WHERE draw_id = ?)`;

const BUMP_LIMIT = `INSERT INTO award_limits (day, key_hash, division, count)
SELECT ?, ?, ?, 1
WHERE EXISTS (SELECT 1 FROM award_runs WHERE draw_id = ?)
ON CONFLICT (day, key_hash, division) DO UPDATE SET count = count + 1`;

const UPSERT_TALLY = `INSERT INTO award_tally (division, game_id, appearances, championships, wins, losses, updated_at)
SELECT ?, json_extract(value, '$.g'), 1, json_extract(value, '$.c'), json_extract(value, '$.w'), json_extract(value, '$.l'), ?
FROM json_each(?)
WHERE EXISTS (SELECT 1 FROM award_runs WHERE draw_id = ?)
ON CONFLICT (division, game_id) DO UPDATE SET
  appearances   = appearances + 1,
  championships = championships + excluded.championships,
  wins          = wins + excluded.wins,
  losses        = losses + excluded.losses,
  updated_at    = excluded.updated_at`;

/** 한 batch: [0] 오래된 제한 행 정리 → [1] 판(한도 안일 때만, draw_id UNIQUE) → [2] 제한 +1 → [3] 누계 UPSERT.
 *  [2]·[3]은 EXISTS(draw_id)로 [1]이 들어갔는지 본다. 그 검사가 "이 batch의 [1]"을 뜻하려면 [1]이 건너뛸 때 같은 draw_id가
 *  이미 있으면 안 된다. 그래서 [1]은 한도를 넘었어도 draw_id가 이미 있으면 INSERT를 시도해 UNIQUE로 실패한다(duplicate).
 *  UNIQUE 위반이면 전부 롤백되고 duplicate, [1]이 0행이면 limited(이때 draw_id는 없었으므로 [2]·[3]도 0행).
 *  한도를 넘긴 뒤의 재제출을 429로 돌려주는 것은 핸들러의 사전 검사가 맡는다 */
export async function recordRun(db: GamesDb, input: RecordRunInput): Promise<RecordRunResult> {
  const { claims, limit, now } = input;
  const { drawId, division, bracket } = claims;
  let results;
  try {
    results = await db.batch([
      db.prepare(DELETE_OLD_LIMITS).bind(limit.day - 1),
      db
        .prepare(INSERT_RUN)
        .bind(
          drawId,
          division,
          bracket.size,
          claims.thirdPlace ? 1 : 0,
          input.championId,
          JSON.stringify({ size: bracket.size, slots: bracket.slots }),
          JSON.stringify(input.picks),
          claims.issuedAt,
          now,
          limit.day,
          limit.keyHash,
          division,
          SUBMIT_LIMIT_PER_DAY,
          drawId,
        ),
      db.prepare(BUMP_LIMIT).bind(limit.day, limit.keyHash, division, drawId),
      db.prepare(UPSERT_TALLY).bind(division, now, JSON.stringify(tallyRows(bracket, input.championId, input.tally)), drawId),
    ]);
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE constraint failed: award_runs.draw_id")) return { ok: false, reason: "duplicate" };
    throw e;
  }
  return results[1].meta.changes === 0 ? { ok: false, reason: "limited" } : { ok: true };
}

/** 오늘 그 키·부문의 성공 제출 수(행이 없으면 0) */
export async function readLimitCount(db: GamesDb, day: number, keyHash: string, division: Division): Promise<number> {
  const row = await db
    .prepare("SELECT count FROM award_limits WHERE day = ? AND key_hash = ? AND division = ?")
    .bind(day, keyHash, division)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/** 부문 후보 id(숨기지 않은 게임 + gameInDivision). 다시보기 날짜가 필요해 listGames(게임 + 다시보기)를 읽고 같은 순수 함수로 거른다.
 *  순서는 drawBracket이 정렬하므로 상관없다 */
export async function loadDivisionCandidates(db: GamesDb, division: Division): Promise<string[]> {
  return (await listGames(db, { includeHidden: false })).filter((g) => gameInDivision(g, division)).map((g) => g.id);
}

/** 순위 행: visible(listGames includeHidden:false, 숨긴 게임은 여기 없어 빠진다) 중 지금 gameInDivision인 게임만.
 *  runs는 그 부문 제출 판 수 */
export async function loadRankingRows(db: GamesDb, division: Division, visible: readonly Game[]): Promise<{ runs: number; rows: TallyRow[] }> {
  const [runs, rows] = await db.batch([
    db.prepare("SELECT count(*) AS runs FROM award_runs WHERE division = ?").bind(division),
    db.prepare("SELECT game_id AS id, appearances, championships, wins, losses FROM award_tally WHERE division = ?").bind(division),
  ]);
  const eligible = new Set(visible.filter((g) => gameInDivision(g, division)).map((g) => g.id));
  return {
    runs: (runs.results[0] as { runs: number }).runs,
    rows: (rows.results as TallyRow[]).filter((r) => eligible.has(r.id)),
  };
}
