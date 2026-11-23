// 2026 야시로 게임 어워즈(이상형 월드컵) 공유 타입. 로직·값 없음(coverage 제외 패턴 **/types.ts).
// scripts·Worker가 Node type stripping으로 import할 수 있게 erasable 구문만 쓴다.
import type { GameStatus, Vod } from "../games/types.ts";

export type Division = "alltime" | "2026";

/** 고른 강 수(SIZE_LADDER의 값) */
export type SizeChoice = number;

/** 클라이언트로 보내는 게임 한 개. IndexedGame에 그대로 대입된다(Poster 재사용).
 *  categoryId·hidden·version·updatedByName·createdAt·updatedAt·lastPlayed는 넣지 않는다 */
export interface AwardEntry {
  id: string;
  name: string;
  /** 값이 있을 때만 키를 둔다 */
  originalTitle?: string;
  /** 값이 있을 때만 키를 둔다 */
  posterUrl?: string;
  firstPlayed: string | null;
  status: GameStatus;
  /** namedYoutubeVod가 고른 편과 highlightVod가 고른 편만(날짜순, 같은 편이면 하나, 없으면 []).
   *  fieldPhoto(entry) === fieldPhoto(원본 게임), highlightVod(entry) === highlightVod(원본 게임)이 성립한다.
   *  다른 편의 highlightStart는 보내지 않는다 */
  vods: Vod[];
  ordinal: number;
  no: string;
  /** 이 게임이 속한 부문(서버가 전체 게임으로 계산, entries.ts gameDivisions). 클라이언트는 이것으로만 거른다.
   *  마지막 플레이(lastPlayed)는 넣지 않는다(방문자에게 보내지 않는 값) */
  divisions: Division[];
}

/** 설정 화면에 보이는 강 하나(sizeOptions). 고를 수 없는 강은 아예 넣지 않는다 */
export interface SizeOption {
  size: SizeChoice;
  /** 후보 수와 강의 관계. 문구는 UI가 정한다 */
  fit: "draw" | "exact" | "byes";
  /** fit=draw: 뽑히지 않는 수(N−B). fit=byes: 부전승 수(B−N). 그 밖 0 */
  extra: number;
}

/** 1라운드 칸. null = 부전승 자리. undefined는 쓰지 않는다(JSON 왕복에서 사라진다) */
export interface Bracket {
  /** 2의 거듭제곱, 2 이상 */
  size: number;
  /** 길이 size. 매치 i = [slots[2i], slots[2i+1]]. slots[2i]는 항상 게임, slots[2i+1]만 null일 수 있다 */
  slots: (string | null)[];
}

export interface TournamentState {
  v: 1;
  division: Division;
  bracket: Bracket;
  /** 실제로 3·4위전을 하는가(요청 && 가능). 요청값은 UI가 따로 든다 */
  thirdPlace: boolean;
  /** 진행한 판(부전승 제외)의 승자 id, 진행 순서대로 */
  picks: string[];
}

export type MatchKind = "main" | "third";

export interface Match {
  kind: MatchKind;
  /** 0부터. third는 결승과 같은 라운드 번호(R−1) */
  round: number;
  /** 라운드 안 위치(0부터). third는 0 */
  index: number;
  /** 이 판이 picks에서 차지하는 위치 */
  pickIndex: number;
  a: string;
  b: string;
}

export interface PlayedMatch extends Match {
  winner: string;
  loser: string;
}

export interface Progress {
  /** "16강" · "결승" · "3·4위전" */
  label: string;
  /** 이 라운드(또는 3·4위전)에서 몇 번째 실제 판인지. 1부터 */
  matchNo: number;
  /** 이 라운드의 실제 판 수(부전승 제외). 결승·3·4위전은 1 */
  matchCount: number;
  /** 끝낸 판 수 = picks.length */
  done: number;
  /** 전체 실제 판 수 = 참가 게임 수 − 1 (+1 if thirdPlace) */
  total: number;
}

export type Placement =
  | { rank: "champion"; id: string }
  | { rank: "runnerUp"; id: string }
  | { rank: "third"; id: string }
  | { rank: "fourth"; id: string }
  | { rank: "jointThird"; id: string };

export interface GameRecordTally {
  wins: number;
  losses: number;
}

export interface Replay {
  played: PlayedMatch[];
  /** 다음에 고를 판. 다 끝났으면 null */
  current: Match | null;
}

export type ReplayError =
  /** picks[at]이 그 판의 두 게임이 아니다 */
  | { reason: "pick"; at: number }
  /** 끝난 뒤에도 picks가 남았다(at = 첫 남는 위치) */
  | { reason: "extra"; at: number };

export type ReplayResult = { ok: true; value: Replay } | { ok: false; error: ReplayError };

export type VerifyFailure =
  | "shape"
  | "division"
  | "bracket"
  | "unknownGame"
  | "thirdPlace"
  | "pick"
  | "extra"
  | "incomplete";

export type VerifyResult =
  | { ok: true; state: TournamentState; placements: Placement[]; tally: Record<string, GameRecordTally> }
  | { ok: false; reason: VerifyFailure; at?: number };
