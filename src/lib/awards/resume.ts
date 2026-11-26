// 새로고침해도 이어 하기: 진행 중인 대진(서버가 서명한 token + 고른 picks)을 브라우저에 저장했다가 되살린다.
// 순수 함수만. localStorage 읽고 쓰기는 src/app/awards/AwardsApp.tsx가 맡는다.
// 대진 자체가 '시드'다: bracket·thirdPlace는 token payload와 같아야 하고, 진행은 picks를 replay해 다시 계산한다.
// 서명은 서버만 확인할 수 있으니 여기서는 만료·대진 일치·picks 유효성만 본다(조작돼도 제출 때 서버가 거부한다).
import { peekDrawClaims } from "./token.ts";
import { isComplete, replay } from "./tournament.ts";
import { isRecord } from "../json.ts";
import { isRunShape } from "./verify.ts";
import type { TournamentState } from "./types.ts";

export const SAVED_RUN_KEY = "yasiro-awards-run";

export interface RestoredRun {
  run: TournamentState;
  token: string;
  /** 모든 판을 골랐다(결과 화면으로 되살린다) */
  complete: boolean;
}

export function serializeRun(run: TournamentState, token: string): string {
  return JSON.stringify({ v: 1, token, run });
}

/**
 * 저장된 문자열 → 이어 할 대진. 하나라도 어긋나면 null(처음부터 시작한다):
 * JSON·모양, token payload와 부문·대진·3·4위전이 다름, 만료(nowSec >= exp), 대진의 게임이 knownIds(지금 화면의
 * 후보)에 없음(숨긴 게임 등), picks가 대진과 맞지 않음.
 */
export function restoreRun(raw: string | null, knownIds: ReadonlySet<string>, nowSec: number): RestoredRun | null {
  if (raw === null) return null;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(saved) || saved.v !== 1 || typeof saved.token !== "string" || !isRunShape(saved.run)) return null;
  const { token, run } = saved as { token: string; run: TournamentState };
  const claims = peekDrawClaims(token);
  if (claims === null || nowSec >= claims.expiresAt) return null;
  if (
    claims.division !== run.division ||
    claims.thirdPlace !== run.thirdPlace ||
    claims.bracket.size !== run.bracket.size ||
    claims.bracket.slots.some((id, i) => id !== run.bracket.slots[i])
  ) {
    return null;
  }
  if (run.bracket.slots.some((id) => id !== null && !knownIds.has(id))) return null;
  let replayed;
  try {
    replayed = replay(run);
  } catch {
    return null;
  }
  if (!replayed.ok) return null;
  const restored: TournamentState = {
    v: 1,
    division: run.division,
    bracket: { size: run.bracket.size, slots: [...run.bracket.slots] },
    thirdPlace: run.thirdPlace,
    picks: [...run.picks],
  };
  return { run: restored, token, complete: isComplete(restored) };
}
