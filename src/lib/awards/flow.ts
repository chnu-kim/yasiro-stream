// 화면 흐름(설정 → 대결 → 결과. 순위는 /awards/rankings 페이지)의 순수 리듀서. 컴포넌트는 이 함수만 부른다. DOM·Math.random 없음(rng 주입).
import { drawBracket } from "./draw.ts";
import { isComplete, pick, startTournament, undo } from "./tournament.ts";
import type { Division, SizeChoice, TournamentState } from "./types.ts";

export type Screen =
  | { kind: "setup" }
  | { kind: "play"; run: TournamentState; token: string }
  | { kind: "result"; run: TournamentState; token: string };

export type Action =
  | { type: "start"; run: TournamentState; token: string }
  | { type: "pick"; winnerId: string; expectedIndex: number }
  | { type: "undo" }
  | { type: "restart" };

export const INITIAL_SCREEN: Screen = { kind: "setup" };

/** 후보 id → 시작 상태. 서버(draw API)가 crypto rng를 넘겨 부른다.
 *  !sizeEnabled(후보 부족 등)이면 drawBracket이 RangeError를 던진다 */
export function newRun(ids: readonly string[], division: Division, choice: SizeChoice, thirdPlaceRequested: boolean, rng: () => number): TournamentState {
  const bracket = drawBracket(ids, choice, rng);
  return startTournament(division, bracket, thirdPlaceRequested);
}

/** 무효한 액션(다른 화면, 더블탭, 빈 되돌리기)은 같은 객체를 돌려준다(React가 다시 그리지 않는다) */
export function reduce(screen: Screen, action: Action): Screen {
  switch (action.type) {
    case "start":
      return { kind: "play", run: action.run, token: action.token };
    case "restart":
      return screen.kind === "setup" ? screen : { kind: "setup" };
    case "pick": {
      if (screen.kind !== "play") return screen;
      const run = pick(screen.run, action.winnerId, action.expectedIndex);
      if (run === screen.run) return screen;
      return isComplete(run) ? { kind: "result", run, token: screen.token } : { kind: "play", run, token: screen.token };
    }
    case "undo": {
      if (screen.kind !== "play") return screen;
      const run = undo(screen.run);
      return run === screen.run ? screen : { kind: "play", run, token: screen.token };
    }
  }
}

/** 이탈 경고(beforeunload)를 걸 때: 한 판 이상 골랐고 아직 끝나지 않음 */
export function inProgress(screen: Screen): boolean {
  return screen.kind === "play" && screen.run.picks.length >= 1;
}

/** 화면이 prev → next로 바뀐 뒤 그 화면 제목으로 포커스를 옮길지. 누른 요소가 사라지거나 비활성이 되는 경우다.
 *  - 다른 화면으로 넘어감(설정 → 대결 포함): 누른 버튼이 언마운트된다
 *  - 대결 중 첫 판까지 되돌림: 되돌리기 버튼이 disabled가 된다
 *  대결 중 고르기·중간 되돌리기는 카드·버튼이 그대로 남아 옮기지 않는다 */
export function focusHeadingAfter(prev: Screen, next: Screen): boolean {
  if (prev === next) return false;
  if (prev.kind !== next.kind) return true;
  return next.kind === "play" && prev.kind === "play" && prev.run.picks.length > 0 && next.run.picks.length === 0;
}
