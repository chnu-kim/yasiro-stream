// 실제 token/keys/limit/repo/verify + 테스트 D1로 draw → submit → rankings 전 과정을 돌린다(명세 §11 e2e 1–14).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { YASIRO_CHANNEL_ID } from "../games/admin.ts";
import { setHidden } from "../games/repo.ts";
import { createGamesTestDb, FAKE_ADMIN_ID, FAKE_USER_ID, findStringAnywhere, insertSession, type TestD1 } from "../games/test-d1.ts";
import { handleDraw, handleRankings, handleSubmit, loadAwardsPage, loadAwardsRankingsPage, type AwardsDeps } from "./api.ts";
import { DIVISIONS, divisionEntries } from "./entries.ts";
import { loadDivisionCandidates } from "./repo.ts";
import { classifySubmit } from "./client.ts";
import { deriveAwardKeys } from "./keys.ts";
import { kstDay, SUBMIT_LIMIT_PER_DAY } from "./limit.ts";
import { base64urlDecode, base64urlEncode, DRAW_TTL_SECONDS, signDraw, verifyDraw } from "./token.ts";
import { currentMatch, pick } from "./tournament.ts";
import type { Division, TournamentState } from "./types.ts";

// 2026-11-22 12:00 KST
const NOW = Date.UTC(2026, 10, 22, 3, 0, 0) / 1000;
const ORIGIN = "https://yasiro.stream";
const REAL_NAME = "실명채널";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const IP = "203.0.113.7";
const ADMIN = "a".repeat(64);
const YASIRO = "b".repeat(64);
const USER = "c".repeat(64);
const EXPIRED = "d".repeat(64);
const AWARD_TABLES = ["award_runs", "award_tally", "award_limits"];

let d1: TestD1;
let logs: string[];
let texts: string[];
let clock: number;
let uuidCounter: number;
let seed: number;

function deps(extra: Partial<AwardsDeps> = {}): AwardsDeps {
  return {
    db: d1.db,
    env: { ADMIN_CHANNEL_IDS: FAKE_ADMIN_ID, AWARDS_SECRET: SECRET },
    now: () => clock,
    uuid: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`,
    // 결정적 LCG
    rng: () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    },
    log: (m) => logs.push(m),
    ...extra,
  };
}

function req(method: string, path: string, session: string | null, body?: unknown, headers: Record<string, string> = {}): Request {
  const h: Record<string, string> = { origin: ORIGIN, "cf-connecting-ip": IP, ...headers };
  if (session !== null) h.cookie = `__Host-session=${session}`;
  if (body !== undefined) h["content-type"] = "application/json";
  return new Request(`${ORIGIN}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function read(res: Response): Promise<{ status: number; body: any; headers: Headers }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const text = await res.text();
  texts.push(text);
  expect(res.headers.get("cache-control")).toBe("no-store");
  return { status: res.status, body: JSON.parse(text), headers: res.headers };
}

const draw = async (body: unknown, session: string | null = ADMIN, d = deps(), headers: Record<string, string> = {}) =>
  read(await handleDraw(req("POST", "/api/awards/draw", session, body, headers), d));
const submit = async (division: string | null, body: unknown, session: string | null = ADMIN, d = deps(), headers: Record<string, string> = {}) =>
  read(await handleSubmit(req("POST", `/api/awards/submit${division === null ? "" : `?division=${division}`}`, session, body, headers), d));
const rankings = async (division: string | null, session: string | null = ADMIN, d = deps()) =>
  read(await handleRankings(req("GET", `/api/awards/rankings${division === null ? "" : `?division=${division}`}`, session), d));

/** 매 판 왼쪽(a)을 고른 완료 picks */
function finish(run: TournamentState): string[] {
  let s = run;
  for (let m = currentMatch(s); m !== null; m = currentMatch(s)) s = pick(s, m.a, s.picks.length);
  return s.picks;
}

async function drawAndFinish(division: Division = "alltime", size = 16, d = deps(), headers: Record<string, string> = {}) {
  const r = await draw({ division, size, thirdPlace: false }, ADMIN, d, headers);
  expect(r.status).toBe(200);
  return { token: r.body.token as string, run: r.body.run as TournamentState, picks: finish(r.body.run) };
}

const count = (table: string) => (d1.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n;

beforeEach(() => {
  d1 = createGamesTestDb();
  logs = [];
  texts = [];
  clock = NOW;
  uuidCounter = 0;
  seed = 42;
  // 20개: 2026 첫 플레이 5개(y1..y5), 그 밖 15개(o01..o15, 하나는 날짜 없음)
  const ins = d1.sqlite.prepare("INSERT INTO games (id, name, first_played) VALUES (?, ?, ?)");
  for (let i = 1; i <= 5; i++) ins.run(`y${i}`, `올해${i}`, `2026-0${i}-01`);
  for (let i = 1; i <= 15; i++) ins.run(`o${String(i).padStart(2, "0")}`, `옛${i}`, i === 15 ? null : `2025-01-${String(i).padStart(2, "0")}`);
  insertSession(d1, { id: ADMIN, channelId: FAKE_ADMIN_ID, channelName: REAL_NAME, expiresAt: NOW + 10 * 86400 });
  insertSession(d1, { id: YASIRO, channelId: YASIRO_CHANNEL_ID, channelName: "야시로 본채널", expiresAt: NOW + 10 * 86400 });
  insertSession(d1, { id: USER, channelId: FAKE_USER_ID, channelName: "일반시청자", expiresAt: NOW + 10 * 86400 });
  insertSession(d1, { id: EXPIRED, channelId: FAKE_ADMIN_ID, channelName: REAL_NAME, expiresAt: NOW });
});

afterEach(() => d1.close());

describe("draw → submit", () => {
  it("1–3: 무상태 draw, 완결 제출 200, 같은 대진 재제출 409", async () => {
    const r = await draw({ division: "alltime", size: 16, thirdPlace: false });
    expect(r.status).toBe(200);
    expect(r.body.expiresAt).toBe(NOW + DRAW_TTL_SECONDS);
    expect(r.body.run).toMatchObject({ v: 1, division: "alltime", thirdPlace: false, picks: [] });
    expect(r.body.run.bracket.size).toBe(16);
    expect(r.body.run.bracket.slots.every((s: string | null) => s !== null)).toBe(true);
    const checked = await verifyDraw((await deriveAwardKeys(SECRET))!.draw, r.body.token, NOW);
    expect(checked).toEqual({
      ok: true,
      claims: { drawId: "00000000-0000-4000-8000-000000000001", division: "alltime", bracket: r.body.run.bracket, thirdPlace: false, issuedAt: NOW, expiresAt: NOW + DRAW_TTL_SECONDS },
    });
    for (const t of AWARD_TABLES) expect(count(t), t).toBe(0);

    const picks = finish(r.body.run);
    expect(picks).toHaveLength(15);
    const ok = await submit("alltime", { token: r.body.token, picks });
    expect(ok).toMatchObject({ status: 200, body: { recorded: true, division: "alltime" } });
    expect(count("award_runs")).toBe(1);
    expect(count("award_tally")).toBe(16);
    const sums = d1.sqlite.prepare("SELECT sum(championships) c, sum(wins) w, sum(losses) l, sum(appearances) a FROM award_tally").get();
    expect(sums).toEqual({ c: 1, w: 15, l: 15, a: 16 });
    expect(d1.sqlite.prepare("SELECT game_id FROM award_tally WHERE championships = 1").get()).toEqual({ game_id: picks.at(-1) });
    expect(d1.sqlite.prepare("SELECT champion_id FROM award_runs").get()).toEqual({ champion_id: picks.at(-1) });
    expect(d1.sqlite.prepare("SELECT count FROM award_limits").all()).toEqual([{ count: 1 }]);

    const again = await submit("alltime", { token: r.body.token, picks });
    expect(again).toMatchObject({ status: 409, body: { error: { code: "already_submitted", message: "이미 집계에 반영된 대진이에요." } } });
    expect(count("award_runs")).toBe(1);
    expect(d1.sqlite.prepare("SELECT sum(appearances) a FROM award_tally").get()).toEqual({ a: 16 });
    expect(d1.sqlite.prepare("SELECT count FROM award_limits").all()).toEqual([{ count: 1 }]);
    expect(logs).toEqual([]);
  });

  it("4: 미완·남의 게임 pick → 422 invalid_run + reason", async () => {
    const { token, picks } = await drawAndFinish();
    const incomplete = await submit("alltime", { token, picks: picks.slice(0, -1) });
    expect(incomplete).toMatchObject({ status: 422, body: { error: { code: "invalid_run", message: "끝까지 마친 대진만 집계할 수 있어요." }, reason: "incomplete" } });
    expect(Object.keys(incomplete.body).sort()).toEqual(["error", "reason"]);
    const foreign = await submit("alltime", { token, picks: ["y1-없는게임", ...picks.slice(1)] });
    expect(foreign).toMatchObject({ status: 422, body: { reason: "pick" } });
    const extra = await submit("alltime", { token, picks: [...picks, picks[0]] });
    expect(extra).toMatchObject({ status: 422, body: { reason: "extra" } });
    for (const t of AWARD_TABLES) expect(count(t), t).toBe(0);
  });

  it("5: 대진 조작(서명 그대로)·다른 secret → 400 bad_token", async () => {
    const { token, picks } = await drawAndFinish();
    const [v, p, s] = token.split(".");
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(p)!));
    payload.b.slots[0] = payload.b.slots[0] === "y1" ? "y2" : "y1";
    const forged = `${v}.${base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))}.${s}`;
    const bad = { status: 400, body: { error: { code: "bad_token", message: "대진 정보가 올바르지 않아요." } } };
    expect(await submit("alltime", { token: forged, picks })).toMatchObject(bad);
    const checked = await verifyDraw((await deriveAwardKeys(SECRET))!.draw, token, NOW);
    if (!checked.ok) throw new Error("token should verify");
    const other = await signDraw((await deriveAwardKeys("z".repeat(32)))!.draw, checked.claims);
    expect(await submit("alltime", { token: other, picks })).toMatchObject(bad);
    expect(await submit("alltime", { token: "garbage", picks })).toMatchObject(bad);
    for (const t of AWARD_TABLES) expect(count(t), t).toBe(0);
  });

  it("6: 만료 → 410 draw_expired", async () => {
    const { token, picks } = await drawAndFinish();
    clock = NOW + DRAW_TTL_SECONDS;
    expect(await submit("alltime", { token, picks })).toMatchObject({
      status: 410,
      body: { error: { code: "draw_expired", message: "대진을 뽑은 지 24시간이 지나 집계에 넣을 수 없어요." } },
    });
    clock = NOW + DRAW_TTL_SECONDS - 1;
    expect((await submit("alltime", { token, picks })).status).toBe(200);
  });

  it("7: 쿼리 부문이 토큰과 다르거나 없거나 틀리면 400", async () => {
    const { token, picks } = await drawAndFinish();
    const bad = { status: 400, body: { error: { code: "bad_request" } } };
    expect(await submit("2026", { token, picks })).toMatchObject(bad);
    expect(await submit(null, { token, picks })).toMatchObject(bad);
    expect(await submit("nope", { token, picks })).toMatchObject(bad);
    for (const t of AWARD_TABLES) expect(count(t), t).toBe(0);
  });

  it("본문 모양이 틀리면 400 bad_request / JSON이 아니면 bad_json / 512KB 초과 413", async () => {
    const { token, picks } = await drawAndFinish();
    for (const body of [null, [], { token }, { picks }, { token, picks, extra: 1 }, { token: 1, picks }, { token, picks: "a" }, { token, picks: [1] }, { token, picks: Array(1025).fill("a") }]) {
      expect(await submit("alltime", body), JSON.stringify(body).slice(0, 40)).toMatchObject({ status: 400, body: { error: { code: "bad_request" } } });
    }
    const raw = new Request(`${ORIGIN}/api/awards/submit?division=alltime`, { method: "POST", headers: { origin: ORIGIN, cookie: `__Host-session=${ADMIN}` }, body: "{" });
    expect(await read(await handleSubmit(raw, deps()))).toMatchObject({ status: 400, body: { error: { code: "bad_json" } } });
    expect(await submit("alltime", { token, picks: ["x".repeat(600 * 1024)] })).toMatchObject({ status: 413, body: { error: { code: "payload_too_large" } } });
  });

  it("8: 같은 IP·부문은 KST 하루 10회. 넘긴 뒤 재제출도 429, 다른 IP·부문·다음 날은 통과", async () => {
    const first = await drawAndFinish();
    expect((await submit("alltime", { token: first.token, picks: first.picks })).status).toBe(200);
    let tenth = first;
    for (let i = 1; i < SUBMIT_LIMIT_PER_DAY; i++) {
      tenth = await drawAndFinish();
      expect((await submit("alltime", { token: tenth.token, picks: tenth.picks })).status).toBe(200);
    }
    expect(d1.sqlite.prepare("SELECT count FROM award_limits").all()).toEqual([{ count: 10 }]);
    // 10번째 응답이 끊겨 다시 보내면 409가 아니라 429 → 클라이언트는 반영 여부를 단정하지 않는다(limitUnsure)
    const resent = await submit("alltime", { token: tenth.token, picks: tenth.picks });
    expect(resent.status).toBe(429);
    expect(classifySubmit(resent.status, true)).toEqual({ kind: "failed", reason: "limitUnsure" });
    const eleventh = await drawAndFinish();
    const limited = await submit("alltime", { token: eleventh.token, picks: eleventh.picks });
    expect(limited).toMatchObject({ status: 429, body: { error: { code: "rate_limited", message: "오늘 이 부문은 10번까지 집계돼요." } } });
    // 12:00 KST → 다음 자정까지 12시간
    expect(limited.headers.get("retry-after")).toBe(String(12 * 3600));
    // 우선순위: 이미 제출한 토큰도 409가 아니라 429
    expect((await submit("alltime", { token: first.token, picks: first.picks })).status).toBe(429);
    expect(count("award_runs")).toBe(10);

    // 다른 IP(같은 /64 IPv6 두 주소는 한 버킷)
    const v6a = await drawAndFinish();
    expect((await submit("alltime", { token: v6a.token, picks: v6a.picks }, ADMIN, deps(), { "cf-connecting-ip": "2001:db8:0:42::1" })).status).toBe(200);
    expect(await submit("alltime", { token: eleventh.token, picks: eleventh.picks }, ADMIN, deps(), { "cf-connecting-ip": "2001:db8:0:42::2" })).toMatchObject({ status: 200 });
    expect(d1.sqlite.prepare("SELECT count FROM award_limits ORDER BY count").all()).toEqual([{ count: 2 }, { count: 10 }]);
    // 다른 부문
    const y = await drawAndFinish("2026", 4);
    expect((await submit("2026", { token: y.token, picks: y.picks })).status).toBe(200);

    // 다음 날(KST): 통과. 그다음 날에는 이틀 전 행이 지워진다
    clock = NOW + 86400;
    const tomorrow = await drawAndFinish();
    expect((await submit("alltime", { token: tomorrow.token, picks: tomorrow.picks })).status).toBe(200);
    const days = () => d1.sqlite.prepare("SELECT DISTINCT day FROM award_limits ORDER BY day").all().map((r) => r.day);
    expect(days()).toEqual([kstDay(NOW), kstDay(NOW) + 1]);
    clock = NOW + 2 * 86400;
    const later = await drawAndFinish();
    expect((await submit("alltime", { token: later.token, picks: later.picks })).status).toBe(200);
    expect(days()).toEqual([kstDay(NOW) + 1, kstDay(NOW) + 2]);
  });

  it("8b: CF-Connecting-IP가 없으면 모두 unknown 한 버킷", async () => {
    const h = { "cf-connecting-ip": "" };
    const r = await drawAndFinish();
    expect((await submit("alltime", { token: r.token, picks: r.picks }, ADMIN, deps(), h)).status).toBe(200);
    const noHeader = new Request(`${ORIGIN}/api/awards/submit?division=alltime`, {
      method: "POST",
      headers: { origin: ORIGIN, cookie: `__Host-session=${ADMIN}` },
      body: JSON.stringify(await drawAndFinish().then((x) => ({ token: x.token, picks: x.picks }))),
    });
    expect((await read(await handleSubmit(noHeader, deps()))).status).toBe(200);
    expect(d1.sqlite.prepare("SELECT count FROM award_limits").all()).toEqual([{ count: 2 }]);
  });

  it("9: 사전 검사 뒤 batch 전에 한도가 차면 429, 아무것도 쓰지 않는다", async () => {
    const { token, picks } = await drawAndFinish();
    // 요청 키의 행을 먼저 만들어 두고(1회 제출), 그 행을 batch 직전에 10으로 올린다
    const warm = await drawAndFinish();
    expect((await submit("alltime", { token: warm.token, picks: warm.picks })).status).toBe(200);
    const before = { runs: count("award_runs"), tally: d1.sqlite.prepare("SELECT sum(appearances) a FROM award_tally").get() };
    const racing = deps({
      db: {
        prepare: (q) => d1.db.prepare(q),
        batch: (s) => {
          d1.sqlite.prepare("UPDATE award_limits SET count = 10").run();
          return d1.db.batch(s);
        },
      },
    });
    const r = await submit("alltime", { token, picks }, ADMIN, racing);
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe(String(12 * 3600));
    expect(count("award_runs")).toBe(before.runs);
    expect(d1.sqlite.prepare("SELECT sum(appearances) a FROM award_tally").get()).toEqual(before.tally);
  });

  it("10: 2026 부문은 첫 플레이 2026만, 후보가 모자라면 422, 사다리 밖 강은 400", async () => {
    const r = await draw({ division: "2026", size: 4, thirdPlace: true });
    expect(r.status).toBe(200);
    const ids = r.body.run.bracket.slots.filter((s: string | null) => s !== null);
    expect(ids).toHaveLength(4);
    expect(ids.every((id: string) => /^y\d$/.test(id))).toBe(true);
    expect(r.body.run.thirdPlace).toBe(true);
    expect(await draw({ division: "2026", size: 16, thirdPlace: false })).toMatchObject({
      status: 422,
      body: { error: { code: "size_unavailable", message: "후보 수가 바뀌어 이 대진을 뽑을 수 없어요." } },
    });
    for (const size of [2, 8, 3, 2048, 16.5, "16"]) {
      expect(await draw({ division: "alltime", size, thirdPlace: false }), String(size)).toMatchObject({ status: 400, body: { error: { code: "bad_request" } } });
    }
    for (const body of [null, [], { division: "alltime", size: 16 }, { division: "x", size: 16, thirdPlace: false }, { division: "alltime", size: 16, thirdPlace: 0 }, { division: "alltime", size: 16, thirdPlace: false, more: 1 }]) {
      expect((await draw(body)).status, JSON.stringify(body)).toBe(400);
    }
    // 32강(후보 20 → 부전승 12)은 alltime에서 된다. 3·4위전 요청 그대로
    const big = await draw({ division: "alltime", size: 32, thirdPlace: true });
    expect(big.status).toBe(200);
    expect(big.body.run.thirdPlace).toBe(true);
    expect(big.body.run.bracket.slots.filter((s: string | null) => s === null)).toHaveLength(12);
    expect((await submit("alltime", { token: big.body.token, picks: finish(big.body.run) })).status).toBe(200);
    // 3·4위전 포함: 20개 참가 → 19판 + 1
    expect(d1.sqlite.prepare("SELECT sum(wins) w, sum(losses) l, count(*) n FROM award_tally").get()).toEqual({ w: 20, l: 20, n: 20 });
    expect(d1.sqlite.prepare("SELECT third_place, size FROM award_runs").get()).toEqual({ third_place: 1, size: 32 });
  });

  it("draw 본문 1KB 초과 413, JSON 아님 400 bad_json", async () => {
    expect(await draw({ division: "alltime", size: 16, thirdPlace: false, pad: "x".repeat(1100) })).toMatchObject({ status: 413 });
    const raw = new Request(`${ORIGIN}/api/awards/draw`, { method: "POST", headers: { origin: ORIGIN, cookie: `__Host-session=${ADMIN}` }, body: "nope" });
    expect(await read(await handleDraw(raw, deps()))).toMatchObject({ status: 400, body: { error: { code: "bad_json" } } });
  });
});

describe("rankings", () => {
  it("11: 우승 게임이 순위에. 숨기면 빠지고(runs 그대로), 되살리면 돌아온다. 2026은 지금 첫 플레이가 2026인 게임만", async () => {
    const empty = await rankings("alltime");
    expect(empty).toMatchObject({ status: 200, body: { division: "alltime", runs: 0, minMatches: 10, byChampionships: [], byWinRate: [] } });

    const { token, picks } = await drawAndFinish();
    await submit("alltime", { token, picks });
    const champ = picks.at(-1)!;
    const r = await rankings("alltime");
    expect(r.body.runs).toBe(1);
    expect(r.body.byChampionships).toEqual([{ id: champ, appearances: 1, championships: 1, wins: 4, losses: 0 }]);
    expect(r.body.byWinRate).toEqual([]);
    expect(Object.keys(r.body).sort()).toEqual(["byChampionships", "byWinRate", "division", "minMatches", "runs"]);

    const ctx = { actor: { channelId: FAKE_ADMIN_ID, name: "관리자" as const }, now: NOW, uuid: () => "c1" };
    await setHidden(d1.db, champ, true, ctx);
    const hidden = await rankings("alltime");
    expect(hidden.body.runs).toBe(1);
    expect(hidden.body.byChampionships).toEqual([]);
    await setHidden(d1.db, champ, false, { ...ctx, uuid: () => "c2" });
    expect((await rankings("alltime")).body.byChampionships.map((x: { id: string }) => x.id)).toEqual([champ]);

    const y = await drawAndFinish("2026", 4);
    await submit("2026", { token: y.token, picks: y.picks });
    const yChamp = y.picks.at(-1)!;
    expect((await rankings("2026")).body.byChampionships.map((x: { id: string }) => x.id)).toEqual([yChamp]);
    d1.sqlite.prepare("UPDATE games SET first_played = '2025-06-01' WHERE id = ?").run(yChamp);
    const moved = await rankings("2026");
    expect(moved.body).toMatchObject({ runs: 1, byChampionships: [] });

    expect(await rankings(null)).toMatchObject({ status: 400, body: { error: { code: "bad_request" } } });
    expect(await rankings("1999")).toMatchObject({ status: 400 });
    // secret이 없어도 순위는 읽는다
    expect((await rankings("alltime", ADMIN, deps({ env: { ADMIN_CHANNEL_IDS: FAKE_ADMIN_ID } }))).status).toBe(200);
  });
});

describe("권한·익명", () => {
  it("12: 비로그인·만료 401, 일반 사용자 403, cross-origin 403 / 야시로 채널은 관리자", async () => {
    const body = { division: "alltime", size: 16, thirdPlace: false };
    const { token, picks } = await drawAndFinish();
    const sub = { token, picks };
    for (const call of [
      (s: string | null) => draw(body, s),
      (s: string | null) => submit("alltime", sub, s),
      (s: string | null) => rankings("alltime", s),
    ]) {
      expect(await call(null)).toMatchObject({ status: 401, body: { error: { code: "login_required", message: "치지직으로 로그인해 주세요." } } });
      expect(await call("e".repeat(64))).toMatchObject({ status: 401, body: { error: { code: "session_expired" } } });
      expect(await call(EXPIRED)).toMatchObject({ status: 401, body: { error: { code: "session_expired", message: "로그인이 만료됐어요. 다시 로그인해 주세요." } } });
      expect(await call(USER)).toMatchObject({ status: 403, body: { error: { code: "forbidden", message: "권한이 없어요." } } });
    }
    const cross = { status: 403, body: { error: { code: "cross_origin", message: "다른 사이트에서 보낸 요청은 받을 수 없어요." } } };
    expect(await draw(body, ADMIN, deps(), { origin: "https://evil.example" })).toMatchObject(cross);
    expect(await submit("alltime", sub, ADMIN, deps(), { origin: "https://evil.example" })).toMatchObject(cross);
    for (const t of AWARD_TABLES) expect(count(t), t).toBe(0);
    // 야시로 채널은 ADMIN_CHANNEL_IDS 없이도 관리자
    expect((await draw(body, YASIRO, deps({ env: { AWARDS_SECRET: SECRET } }))).status).toBe(200);
  });

  it("13: award 테이블·응답·로그 어디에도 실명·채널 ID·IP가 없고, 로그에는 토큰도 없다", async () => {
    const tokens: string[] = [];
    for (let i = 0; i < 2; i++) {
      const r = await drawAndFinish();
      tokens.push(r.token);
      await submit("alltime", { token: r.token, picks: r.picks });
    }
    await submit("alltime", { token: tokens[0], picks: [] });
    await rankings("alltime");
    // 500 경로의 로그도 확인
    const broken = vi.fn(() => {
      throw new Error(`boom ${IP} ${FAKE_ADMIN_ID}`);
    });
    await rankings("alltime", ADMIN, deps({ db: { prepare: broken, batch: broken } }));
    expect(logs).toEqual(["awards-api unavailable Error"]);

    for (const needle of [REAL_NAME, FAKE_ADMIN_ID, IP]) {
      expect(findStringAnywhere(d1, needle, AWARD_TABLES), needle).toEqual([]);
      expect(texts.join("\n"), needle).not.toContain(needle);
      expect(logs.join("\n"), needle).not.toContain(needle);
    }
    for (const t of tokens) expect(logs.join("\n")).not.toContain(t);
    const limitCols = d1.sqlite.prepare("SELECT * FROM award_limits").all();
    expect(limitCols).toHaveLength(1);
    expect(Object.keys(limitCols[0]).sort()).toEqual(["count", "day", "division", "key_hash"]);
  });

  it("14: loadAwardsPage — 관리자 ok(숨김 제외) / 그 밖 denied / D1 오류 error와 로그", async () => {
    d1.sqlite.prepare("UPDATE games SET hidden = 1 WHERE id = 'o01'").run();
    const page = await loadAwardsPage(deps(), `__Host-session=${ADMIN}`);
    expect(page.kind).toBe("ok");
    const entries = page.kind === "ok" ? page.entries : [];
    expect(entries).toHaveLength(19);
    expect(entries.map((g) => g.id)).not.toContain("o01");
    for (const k of ["hidden", "version", "updatedByName", "categoryId", "lastPlayed"]) expect(Object.keys(entries[0])).not.toContain(k);
    expect(JSON.stringify(page)).not.toContain(FAKE_ADMIN_ID);
    expect(JSON.stringify(page)).not.toContain(REAL_NAME);
    for (const cookie of [null, `__Host-session=${USER}`, `__Host-session=${EXPIRED}`, `__Host-session=${"e".repeat(64)}`]) {
      expect(await loadAwardsPage(deps(), cookie)).toEqual({ kind: "denied" });
    }
    expect((await loadAwardsPage(deps({ env: {} }), `__Host-session=${YASIRO}`)).kind).toBe("ok");
    const broken = vi.fn(() => {
      throw new Error("no such table");
    });
    expect(await loadAwardsPage(deps({ db: { prepare: broken, batch: broken } }), `__Host-session=${ADMIN}`)).toEqual({ kind: "error" });
    expect(logs).toEqual(["awards-api unavailable Error"]);
  });
});

describe("2026 부문 = 2026년에 한 게임: 서버·클라이언트 일치, 순위 페이지", () => {
  /** 다른 어디에도 없는 날짜(새면 바로 보인다) */
  const UNIQUE = "2026-12-19";
  let vodN = 0;
  function fixtures() {
    d1.sqlite.exec("DELETE FROM games");
    const ins = d1.sqlite.prepare("INSERT INTO games (id, name, first_played, last_played, hidden) VALUES (?, ?, ?, ?, ?)");
    const vod = (gameId: string, date: string) => {
      const vid = `v${String(++vodN).padStart(10, "0")}`;
      d1.sqlite
        .prepare("INSERT INTO game_vods (game_id, video_id, url, title, date, position) VALUES (?, ?, ?, '방송', ?, 0)")
        .run(gameId, vid, `https://www.youtube.com/watch?v=${vid}`, date);
    };
    ins.run("a", "에이", "2026-03-01", null, 0);
    ins.run("b", "비", "2025-10-01", null, 0);
    vod("b", "2026-02-01");
    ins.run("c", "씨", "2025-05-01", null, 0);
    vod("c", "2025-06-01");
    ins.run("d", "디", null, null, 0);
    vod("d", "2026-04-04");
    ins.run("e", "이", null, null, 0);
    ins.run("f", "에프", "2024-01-01", UNIQUE, 0);
    ins.run("g", "지", "2026-05-05", null, 1);
    ins.run("h", "에이치", "2025-12-31", null, 0);
  }

  /** 2026 4강을 뽑아 winner가 매 판 이기게 끝내고 제출한다(우승 목록에는 우승한 게임만 오른다) */
  async function submitWon(winner: string) {
    const r = await draw({ division: "2026", size: 4, thirdPlace: false });
    let st = r.body.run as TournamentState;
    for (let m = currentMatch(st); m !== null; m = currentMatch(st)) st = pick(st, m.b === winner ? m.b : m.a, st.picks.length);
    expect((await submit("2026", { token: r.body.token, picks: st.picks })).status).toBe(200);
  }

  it("draw 후보 == 페이지 entries의 divisionEntries (부문마다), 2026은 [a, b, d, f]", async () => {
    fixtures();
    const page = await loadAwardsPage(deps(), `__Host-session=${ADMIN}`);
    if (page.kind !== "ok") throw new Error("page");
    for (const division of DIVISIONS) {
      const server = (await loadDivisionCandidates(d1.db, division)).sort();
      const client = divisionEntries(page.entries, division).map((e) => e.id).sort();
      expect(client, division).toEqual(server);
    }
    expect(divisionEntries(page.entries, "2026").map((e) => e.id).sort()).toEqual(["a", "b", "d", "f"]);
    expect(divisionEntries(page.entries, "alltime").map((e) => e.id).sort()).toEqual(["a", "b", "c", "d", "e", "f", "h"]);
    const text = JSON.stringify(page);
    expect(text).not.toContain("lastPlayed");
    expect(text).not.toContain(UNIQUE);

    // 같은 데이터로 2026 4강을 뽑으면 후보 4개가 모두 들어간다(클라이언트 개수와 같다)
    const r = await draw({ division: "2026", size: 4, thirdPlace: false });
    expect(r.status).toBe(200);
    expect((r.body.run.bracket.slots as string[]).slice().sort()).toEqual(["a", "b", "d", "f"]);
  });

  it("loadAwardsRankingsPage: 관리자 ok·순위에 든 게임만, 그 밖 denied, 순위를 못 읽으면 rankings null, D1 오류 error", async () => {
    fixtures();
    // b: 2025년 첫 플레이 + 2026 다시보기
    await submitWon("b");
    const page = await loadAwardsRankingsPage(deps(), `__Host-session=${ADMIN}`, "2026");
    if (page.kind !== "ok" || page.rankings === null) throw new Error("page");
    expect(page.division).toBe("2026");
    expect(page.rankings.runs).toBe(1);
    const ranked = new Set([...page.rankings.byChampionships, ...page.rankings.byWinRate].map((r) => r.id));
    expect(new Set(page.entries.map((e) => e.id))).toEqual(ranked);
    expect([...ranked]).toEqual(["b"]);
    // 번호는 전체 목록 기준(보이는 7개: a 007, h 006, b 005, …)
    expect(page.entries.map((e) => [e.id, e.no])).toEqual([["b", "005"]]);
    const text = JSON.stringify(page);
    expect(text).not.toContain("lastPlayed");
    expect(text).not.toContain(UNIQUE);
    expect(text).not.toContain(FAKE_ADMIN_ID);

    const empty = await loadAwardsRankingsPage(deps(), `__Host-session=${ADMIN}`, "alltime");
    expect(empty).toMatchObject({ kind: "ok", division: "alltime", rankings: { runs: 0, byChampionships: [], byWinRate: [] }, entries: [] });

    for (const cookie of [null, `__Host-session=${USER}`, `__Host-session=${EXPIRED}`]) {
      expect(await loadAwardsRankingsPage(deps(), cookie, "2026")).toEqual({ kind: "denied" });
    }

    for (const t of AWARD_TABLES) d1.sqlite.exec(`DROP TABLE ${t}`);
    logs = [];
    const missing = await loadAwardsRankingsPage(deps(), `__Host-session=${ADMIN}`, "2026");
    expect(missing).toEqual({ kind: "ok", division: "2026", rankings: null, entries: [] });
    expect(logs).toEqual(["awards-api unavailable Error"]);

    const broken = vi.fn(() => {
      throw new Error("no such table");
    });
    expect(await loadAwardsRankingsPage(deps({ db: { prepare: broken, batch: broken } }), `__Host-session=${ADMIN}`, "2026")).toEqual({ kind: "error" });
  });

  it("GET /api/awards/rankings도 첫 플레이 없이 2026 다시보기만 있는 게임을 2026 순위에 넣는다", async () => {
    fixtures();
    await submitWon("d");
    const r = await rankings("2026");
    expect(r.status).toBe(200);
    expect((r.body.byChampionships as { id: string }[]).map((x) => x.id)).toEqual(["d"]);
  });
});
