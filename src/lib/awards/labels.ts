// 어워즈 화면 문구. UI는 이 함수들만 쓴다(문구를 컴포넌트에 흩지 않는다).
import { thirdPlaceAvailable } from "./options.ts";
import type { Placement, Progress, SizeOption } from "./types.ts";

export const PAGE_TITLE = "2026 야시로 게임 어워즈";
/** /awards/rankings 제목(새 문구, 사용자 확인 전) */
export const RANKINGS_PAGE_TITLE = "게임 어워즈 집계 순위";

/** "4강", "512강" */
export function sizeLabel(option: SizeOption): string {
  return `${option.size}강`;
}

/** 선택한 대진 아래 한 줄 설명. n = 후보 수 */
export function fitText(option: SizeOption, n: number): string {
  switch (option.fit) {
    case "draw":
      return `${n}개 중 ${option.size}개를 무작위로 뽑아요.`;
    case "exact":
      return `후보 ${n}개가 모두 나와요.`;
    case "byes":
      return `후보 ${n}개가 모두 나오고, ${option.extra}자리는 부전승이에요.`;
  }
}

/** 3·4위전을 못 하는 이유. 할 수 있으면 null */
export function thirdPlaceNote(size: number, n: number): string | null {
  if (thirdPlaceAvailable(size, n)) return null;
  return size <= 2 ? "결승 한 판이라 3·4위전이 없어요." : "준결승에 부전승이 있어 3·4위전을 할 수 없어요.";
}

/** 진행 표시. 결승·3·4위전은 이름만, 나머지는 "16강 3/8" */
export function progressLabel(p: Progress): string {
  return p.matchCount === 1 && (p.label === "결승" || p.label === "3·4위전") ? p.label : `${p.label} ${p.matchNo}/${p.matchCount}`;
}

export function placementLabel(rank: Placement["rank"]): string {
  switch (rank) {
    case "champion":
      return "우승";
    case "runnerUp":
      return "준우승";
    case "third":
      return "3위";
    case "fourth":
      return "4위";
    case "jointThird":
      return "공동 3위";
  }
}

/** 화면 낭독용: "16강 3/8 · A 대 B" */
export function matchAnnouncement(p: Progress, a: string, b: string): string {
  return `${progressLabel(p)} · ${a} 대 ${b}`;
}

/** 결과 요약: "올타임 부문 · 16강 · 전체 15판" */
export function resultSummary(divisionLabel: string, size: number, totalMatchCount: number): string {
  return `${divisionLabel} · ${size}강 · 전체 ${totalMatchCount}판`;
}
