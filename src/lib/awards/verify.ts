// 서버 제출 검증(api.ts handleSubmit): 신뢰할 수 없는 입력(클라이언트가 보낸 JSON)을 검증하고 완료된 대진의 결과를 계산한다.
// 부전승 위치가 byeMatches와 같은지, 대진이 서버가 뽑은 것인지는 보지 않는다(대진 출처는 token.ts 서명이 보증한다).
import { DIVISIONS } from "./entries.ts";
import { thirdPlaceAvailable } from "./options.ts";
import { entrantCount, placements, replay, tally } from "./tournament.ts";
import type { Bracket, Division, TournamentState, VerifyResult } from "./types.ts";

/** 서버가 받는 대진의 상한. nextPow2(후보 수)가 이보다 크면 검증이 거부한다(후보 1024개 초과) */
export const MAX_BRACKET_SIZE = 1024;
/** picks 길이 상한(= 1024강 3·4위전 포함 1024판) */
export const MAX_PICKS = 1024;

const STATE_KEYS = ["bracket", "division", "picks", "thirdPlace", "v"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** bracket 모양만: size 2의 거듭제곱(2..1024), slots 길이 size, 원소는 string|null,
 *  slots[2i] non-null, slots[2i+1] null 허용, non-null 중복 없음, null 수 < size/2(size 2이면 null 없음) */
export function isValidBracket(value: unknown): value is Bracket {
  if (!isPlainObject(value)) return false;
  const { size, slots } = value;
  if (typeof size !== "number" || !Number.isInteger(size) || size < 2 || size > MAX_BRACKET_SIZE) return false;
  if ((size & (size - 1)) !== 0) return false;
  if (!Array.isArray(slots) || slots.length !== size) return false;
  const seen = new Set<string>();
  let nulls = 0;
  for (let i = 0; i < size; i++) {
    const s: unknown = slots[i];
    if (s === null && i % 2 === 1) {
      nulls++;
      continue;
    }
    if (typeof s !== "string" || seen.has(s)) return false;
    seen.add(s);
  }
  return nulls < size / 2;
}

/** 신뢰할 수 없는 입력(JSON)을 검증하고 완료된 대진의 결과를 계산한다.
 *  candidates: 그 부문 후보 id 집합(서버가 다시 계산). 돌려주는 state는 입력과 다른 새 객체다 */
export function verifyRun(input: unknown, candidates: ReadonlySet<string>): VerifyResult {
  if (!isPlainObject(input)) return { ok: false, reason: "shape" };
  const keys = Object.keys(input).sort();
  if (keys.length !== STATE_KEYS.length || keys.some((k, i) => k !== STATE_KEYS[i])) return { ok: false, reason: "shape" };
  const { v, division, bracket, thirdPlace, picks } = input;
  if (v !== 1 || typeof thirdPlace !== "boolean") return { ok: false, reason: "shape" };
  if (!Array.isArray(picks) || picks.length > MAX_PICKS || !picks.every((p) => typeof p === "string")) {
    return { ok: false, reason: "shape" };
  }
  if (!DIVISIONS.includes(division as Division)) return { ok: false, reason: "division" };
  if (!isValidBracket(bracket)) return { ok: false, reason: "bracket" };
  if (!bracket.slots.every((s) => s === null || candidates.has(s))) return { ok: false, reason: "unknownGame" };
  if (thirdPlace && !thirdPlaceAvailable(bracket.size, entrantCount(bracket))) {
    return { ok: false, reason: "thirdPlace" };
  }
  const state: TournamentState = {
    v: 1,
    division: division as Division,
    bracket: { size: bracket.size, slots: [...bracket.slots] },
    thirdPlace,
    picks: [...(picks as string[])],
  };
  const r = replay(state);
  if (!r.ok) return { ok: false, reason: r.error.reason, at: r.error.at };
  if (r.value.current !== null) return { ok: false, reason: "incomplete" };
  // 완료된 상태라 placements는 null이 아니다
  return { ok: true, state, placements: placements(state)!, tally: tally(state) };
}
