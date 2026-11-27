// 어워즈 화면 문구. UI는 이 함수들만 쓴다(문구를 컴포넌트에 흩지 않는다).
import { thirdPlaceAvailable } from "./options.ts";
import type { Division, Placement, Progress, SizeOption } from "./types.ts";

export const PAGE_TITLE = "2026 야시로 게임 어워즈";
/** /awards/rankings 제목(새 문구, 사용자 확인 전) */
export const RANKINGS_PAGE_TITLE = "게임 어워즈 집계 순위";

/** 시상식 패러디 부문 상 이름(영문 의전 라벨, Cinzel). 한글 부문 이름은 entries.ts DIVISION_LABEL */
export const DIVISION_AWARD: Record<Division, string> = { alltime: "Best Game of All Time", "2026": "Best Game of 2026" };

// ── 입장 화면(시상식 입장 → 심사위원 위촉). 문구는 사용자 확인(2026-11-26) ──
export const START_LABEL = "심사 시작하기";
export const SETTINGS_LABEL = "심사 방식 바꾸기";
export const RESULTS_LINK_LABEL = "지금까지의 심사 결과";
export const JUDGE_TITLE = "2026 야시로 게임 어워즈 심사위원";
/** 제목 위 영문 의전 라벨(Cinzel) */
export const CEREMONY_EYEBROW = "The 2026 Yasiro Game Awards";
/** 시작 버튼 위 영문 라벨(Cinzel) */
export const JUDGE_SEAT_LABEL = "Judge's Seat";
/** 입장 → 첫 대결 사이 부문 카드: [영문 라벨(Cinzel), 한글 부문명] */
export const CATEGORY_CARD: Record<Division, [string, string]> = {
  "2026": ["Best Game of 2026", "올해의 게임 부문"],
  alltime: ["All-Time", "역대 최고의 게임 부문"],
};

/** 입장 자막. [보통 글자, 강조 글자]. n = 올해(2026 부문) 후보 수. 마지막 줄이 화면에 남는다
 *  ("오늘 밤, 수상작을 고르는 사람은 — 당신입니다"(2026-11-26)와 "그중 단 한 편만 이 트로피를 받습니다"(2026-11-27)는
 *  오글거리고 주제와 맞지 않아 사용자 요청으로 뺐다) */
export function ceremonyLines(n: number): [string, string][] {
  return [["올해 야시로가 탐험한 게임, ", `${n}편`]];
}

/** 시작 버튼 아래 지금 심사 방식 한 줄: "2026 부문 · 16강 · 3·4위전" */
export function settingsSummary(divisionLabel: string, option: SizeOption | undefined, thirdPlace: boolean): string {
  return [divisionLabel, ...(option === undefined ? [] : [sizeLabel(option)]), ...(thirdPlace ? ["3·4위전"] : [])].join(" · ");
}

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
