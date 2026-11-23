import { describe, expect, it } from "vitest";
import { restoreRun, SAVED_RUN_KEY, serializeRun } from "./resume.ts";
import { base64urlEncode, DRAW_TTL_SECONDS } from "./token.ts";
import { currentMatch, pick, startTournament } from "./tournament.ts";
import type { Bracket, TournamentState } from "./types.ts";

const NOW = 1_792_900_000;
const ID = "0f8e7d6c-5b4a-4321-8fed-cba987654321";
const enc = new TextEncoder();
const BRACKET: Bracket = { size: 4, slots: ["a", "b", "c", "d"] };
const KNOWN = new Set(["a", "b", "c", "d"]);

/** 서명 조각은 아무 값이나(이어 하기는 서명을 보지 않는다) */
function tokenFor(extra: Record<string, unknown> = {}): string {
  const payload = { v: 1, id: ID, d: "alltime", b: BRACKET, t: true, iat: NOW, exp: NOW + DRAW_TTL_SECONDS, ...extra };
  return `v1.${base64urlEncode(enc.encode(JSON.stringify(payload)))}.sig`;
}

const run0 = (): TournamentState => startTournament("alltime", BRACKET, true);
function pickN(run: TournamentState, n: number): TournamentState {
  let s = run;
  for (let i = 0; i < n; i++) {
    const m = currentMatch(s)!;
    s = pick(s, m.a, m.pickIndex);
  }
  return s;
}

describe("restoreRun", () => {
  it("저장 키는 고정", () => {
    expect(SAVED_RUN_KEY).toBe("yasiro-awards-run");
  });

  it("serializeRun한 진행 중 대진을 그대로 되살린다(복사본)", () => {
    const run = pickN(run0(), 2);
    const token = tokenFor();
    const r = restoreRun(serializeRun(run, token), KNOWN, NOW + 10);
    expect(r).toEqual({ run, token, complete: false });
    expect(r!.run).not.toBe(run);
  });

  it("모든 판을 고른 대진은 complete", () => {
    const run = pickN(run0(), 4);
    expect(restoreRun(serializeRun(run, tokenFor()), KNOWN, NOW)?.complete).toBe(true);
  });

  it("없음·JSON·모양이 틀리면 null", () => {
    const token = tokenFor();
    expect(restoreRun(null, KNOWN, NOW)).toBeNull();
    expect(restoreRun("{", KNOWN, NOW)).toBeNull();
    expect(restoreRun("[]", KNOWN, NOW)).toBeNull();
    expect(restoreRun(JSON.stringify({ v: 2, token, run: run0() }), KNOWN, NOW)).toBeNull();
    expect(restoreRun(JSON.stringify({ v: 1, token: 1, run: run0() }), KNOWN, NOW)).toBeNull();
    const bad = (patch: Record<string, unknown>) => JSON.stringify({ v: 1, token, run: { ...run0(), ...patch } });
    expect(restoreRun(bad({ v: 2 }), KNOWN, NOW)).toBeNull();
    expect(restoreRun(bad({ division: 1 }), KNOWN, NOW)).toBeNull();
    expect(restoreRun(bad({ division: "x" }), KNOWN, NOW)).toBeNull();
    expect(restoreRun(bad({ thirdPlace: "y" }), KNOWN, NOW)).toBeNull();
    expect(restoreRun(bad({ picks: "a" }), KNOWN, NOW)).toBeNull();
    expect(restoreRun(bad({ picks: [1] }), KNOWN, NOW)).toBeNull();
    expect(restoreRun(bad({ bracket: { size: 3, slots: [] } }), KNOWN, NOW)).toBeNull();
  });

  it("token을 읽을 수 없거나 만료면 null", () => {
    expect(restoreRun(serializeRun(run0(), "v1.@@.x"), KNOWN, NOW)).toBeNull();
    expect(restoreRun(serializeRun(run0(), tokenFor()), KNOWN, NOW + DRAW_TTL_SECONDS)).toBeNull();
  });

  it("token payload와 부문·3·4위전·대진이 다르면 null", () => {
    const run = run0();
    expect(restoreRun(serializeRun(run, tokenFor({ d: "2026" })), KNOWN, NOW)).toBeNull();
    expect(restoreRun(serializeRun(run, tokenFor({ t: false })), KNOWN, NOW)).toBeNull();
    expect(restoreRun(serializeRun(run, tokenFor({ b: { size: 4, slots: ["a", "c", "b", "d"] } })), KNOWN, NOW)).toBeNull();
    const big = { size: 8, slots: ["a", "b", "c", "d", null, null, null, null] };
    expect(restoreRun(serializeRun(run, tokenFor({ b: big })), KNOWN, NOW)).toBeNull();
  });

  it("대진의 게임이 지금 후보에 없으면 null", () => {
    expect(restoreRun(serializeRun(run0(), tokenFor()), new Set(["a", "b", "c"]), NOW)).toBeNull();
  });

  it("picks가 대진과 맞지 않으면 null(다른 게임·남는 pick)", () => {
    const run = run0();
    expect(restoreRun(serializeRun({ ...run, picks: ["c"] }, tokenFor()), KNOWN, NOW)).toBeNull();
    const done = pickN(run, 4);
    expect(restoreRun(serializeRun({ ...done, picks: [...done.picks, "a"] }, tokenFor()), KNOWN, NOW)).toBeNull();
  });

  it("3·4위전이 불가능한 대진에 thirdPlace면(불변식 위반) null", () => {
    const bye: Bracket = { size: 4, slots: ["a", null, "c", "d"] };
    const run: TournamentState = { v: 1, division: "alltime", bracket: bye, thirdPlace: true, picks: [] };
    expect(restoreRun(serializeRun(run, tokenFor({ b: bye })), KNOWN, NOW)).toBeNull();
  });
});
