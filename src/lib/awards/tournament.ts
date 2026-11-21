// 대진 진행·결과. 상태의 유일한 진행 기록은 picks(고른 게임 id, 부전승 제외)이고 나머지는 replay로 계산한다.
// 순수 함수: 입력 state를 바꾸지 않는다. 서버(PR3 verify)도 같은 replay를 쓴다.
import { thirdPlaceAvailable } from "./options.ts";
import type {
  Bracket,
  Division,
  GameRecordTally,
  Match,
  MatchKind,
  Placement,
  PlayedMatch,
  Progress,
  ReplayError,
  ReplayResult,
  TournamentState,
} from "./types.ts";

export const THIRD_PLACE_LABEL = "3·4위전";

/** 2 → "결승", n → "n강" */
export function roundLabel(entrantsInRound: number): string {
  return entrantsInRound === 2 ? "결승" : `${entrantsInRound}강`;
}

/** 참가 게임 수(non-null 칸) */
export function entrantCount(bracket: Bracket): number {
  return bracket.slots.filter((s) => s !== null).length;
}

/** 전체 실제 판 수 = entrantCount − 1 + (thirdPlace ? 1 : 0) */
export function totalMatches(state: Pick<TournamentState, "bracket" | "thirdPlace">): number {
  return entrantCount(state.bracket) - 1 + (state.thirdPlace ? 1 : 0);
}

/** 시작 상태. thirdPlace = requested && thirdPlaceAvailable(bracket.size, 참가 수). bracket은 복사한다 */
export function startTournament(division: Division, bracket: Bracket, thirdPlaceRequested: boolean): TournamentState {
  return {
    v: 1,
    division,
    bracket: { size: bracket.size, slots: [...bracket.slots] },
    thirdPlace: thirdPlaceRequested && thirdPlaceAvailable(bracket.size, entrantCount(bracket)),
    picks: [],
  };
}

/**
 * 판 순서를 따라 picks를 적용한다. 순서: 라운드 오름차순, 라운드 안은 왼쪽→오른쪽, 3·4위전은 결승 바로 앞.
 * 1라운드에서 한쪽이 null이면 부전승(picks를 쓰지 않고 played에도 넣지 않는다).
 * bracket 모양은 믿는다(신뢰할 수 없는 입력은 verify.ts isValidBracket이 먼저 본다).
 * thirdPlace인데 두 준결승이 실제 판이 아니면 던진다(startTournament·verifyRun이 막는 불변식 위반).
 */
export function replay(state: Pick<TournamentState, "bracket" | "thirdPlace" | "picks">): ReplayResult {
  const { bracket, thirdPlace, picks } = state;
  const size = bracket.size;
  const rounds = Math.log2(size);
  if (thirdPlace && !thirdPlaceAvailable(size, entrantCount(bracket))) {
    throw new Error("thirdPlace requires two real semifinals");
  }
  const played: PlayedMatch[] = [];
  // 클로저 안에서 바꾸는 값은 객체에 둔다(let은 TS가 null로 좁혀 버린다)
  const stop: { current: Match | null; error: ReplayError | null } = { current: null, error: null };
  const finish = (): ReplayResult =>
    stop.error === null ? { ok: true, value: { played, current: stop.current } } : { ok: false, error: stop.error };

  /** 실제 판 하나. 승자를 돌려주고, 멈춰야 하면(다음 판이거나 잘못된 pick) null */
  const decide = (kind: MatchKind, round: number, index: number, a: string, b: string): string | null => {
    const pickIndex = played.length;
    if (pickIndex >= picks.length) {
      stop.current = { kind, round, index, pickIndex, a, b };
      return null;
    }
    const winner = picks[pickIndex];
    if (winner !== a && winner !== b) {
      stop.error = { reason: "pick", at: pickIndex };
      return null;
    }
    played.push({ kind, round, index, pickIndex, a, b, winner, loser: winner === a ? b : a });
    return winner;
  };

  let winners: string[] = [];
  for (let i = 0; i < size / 2; i++) {
    // slots[2i]는 언제나 게임이다(Bracket 불변식)
    const a = bracket.slots[2 * i] as string;
    const b = bracket.slots[2 * i + 1];
    if (b === null) {
      winners.push(a);
      continue;
    }
    const w = decide("main", 0, i, a, b);
    if (w === null) return finish();
    winners.push(w);
  }
  for (let r = 1; r < rounds; r++) {
    if (thirdPlace && r === rounds - 1) {
      // 준결승(라운드 R−2) 매치 0·1의 패자. 위의 검사로 둘 다 실제 판임이 보장된다
      const semiLoser = (index: number) =>
        played.find((m) => m.kind === "main" && m.round === rounds - 2 && m.index === index)!.loser;
      if (decide("third", r, 0, semiLoser(0), semiLoser(1)) === null) return finish();
    }
    const next: string[] = [];
    for (let i = 0; i < winners.length / 2; i++) {
      const w = decide("main", r, i, winners[2 * i], winners[2 * i + 1]);
      if (w === null) return finish();
      next.push(w);
    }
    winners = next;
  }
  if (played.length < picks.length) stop.error = { reason: "extra", at: played.length };
  return finish();
}

/** 신뢰된 상태(클라이언트)의 replay. 실패하면 상태가 깨진 것이라 던진다 */
function mustReplay(state: TournamentState): { played: PlayedMatch[]; current: Match | null } {
  const r = replay(state);
  if (!r.ok) throw new Error(`invalid tournament state: ${r.error.reason} at ${r.error.at}`);
  return r.value;
}

export function currentMatch(state: TournamentState): Match | null {
  return mustReplay(state).current;
}

export function isComplete(state: TournamentState): boolean {
  return currentMatch(state) === null;
}

/** 현재 판의 승자를 고른다. 무효면 같은 객체를 그대로 반환(no-op):
 *  expectedIndex !== state.picks.length(더블탭·지난 화면의 클릭), 끝난 상태, winnerId가 현재 판의 a·b가 아님 */
export function pick(state: TournamentState, winnerId: string, expectedIndex: number): TournamentState {
  if (expectedIndex !== state.picks.length) return state;
  const m = currentMatch(state);
  if (m === null || (winnerId !== m.a && winnerId !== m.b)) return state;
  return { ...state, picks: [...state.picks, winnerId] };
}

/** 마지막 선택을 지운다. picks가 비었으면 같은 객체 */
export function undo(state: TournamentState): TournamentState {
  if (state.picks.length === 0) return state;
  return { ...state, picks: state.picks.slice(0, -1) };
}

/** 진행 표시. 끝난 상태면 마지막 판(결승) 기준이고 matchNo = matchCount */
export function progress(state: TournamentState): Progress {
  const { played, current } = mustReplay(state);
  // 실제 판이 하나 이상(참가 2개 이상)이라 끝난 상태의 마지막 판이 있다
  const m: Match = current ?? played[played.length - 1];
  const { size, slots } = state.bracket;
  let matchCount = 1;
  if (m.kind === "main" && m.round === 0) {
    matchCount = 0;
    for (let i = 1; i < size; i += 2) if (slots[i] !== null) matchCount++;
  } else if (m.kind === "main") {
    matchCount = size / 2 ** (m.round + 1);
  }
  const before = played.filter((x) => x.kind === m.kind && x.round === m.round).length;
  return {
    label: m.kind === "third" ? THIRD_PLACE_LABEL : roundLabel(size / 2 ** m.round),
    matchNo: before + (current === null ? 0 : 1),
    matchCount,
    done: state.picks.length,
    total: totalMatches(state),
  };
}

/** 끝났을 때만. 아니면 null. 순서: champion, runnerUp, third|jointThird…, fourth */
export function placements(state: TournamentState): Placement[] | null {
  const { played, current } = mustReplay(state);
  if (current !== null) return null;
  const final = played[played.length - 1];
  const out: Placement[] = [
    { rank: "champion", id: final.winner },
    { rank: "runnerUp", id: final.loser },
  ];
  if (state.thirdPlace) {
    const third = played.find((m) => m.kind === "third")!;
    out.push({ rank: "third", id: third.winner }, { rank: "fourth", id: third.loser });
    return out;
  }
  // 준결승 패자(부전승 준결승은 패자 없음). size 2는 준결승이 없어 비어 있다
  const semiRound = Math.log2(state.bracket.size) - 2;
  const losers = played.filter((m) => m.kind === "main" && m.round === semiRound).map((m) => m.loser);
  if (losers.length === 2) {
    for (const id of losers) out.push({ rank: "jointThird", id });
  } else if (losers.length === 1) {
    out.push({ rank: "third", id: losers[0] });
  }
  return out;
}

/** 실제로 치른 판만(부전승 제외, 3·4위전 포함) 게임별 승·패. 진행 중이어도 지금까지 기준. 한 판도 안 한 게임은 키가 없다 */
export function tally(state: TournamentState): Record<string, GameRecordTally> {
  const out: Record<string, GameRecordTally> = {};
  // ??=는 "constructor"처럼 Object.prototype에 있는 이름(ID_PATTERN상 가능한 slug)을 이미 있다고 본다
  const at = (id: string) => (Object.hasOwn(out, id) ? out[id] : (out[id] = { wins: 0, losses: 0 }));
  for (const m of mustReplay(state).played) {
    at(m.winner).wins++;
    at(m.loser).losses++;
  }
  return out;
}
