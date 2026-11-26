import { lastPlayedOf } from "./played.ts";
import { formatDate } from "./query.ts";
import type {
  GamesQueryState,
  GameStatus,
  SortKey,
  StatusFilter,
  ViewKey,
  Vod,
  YearFilter,
} from "./types.ts";

export const STATUS_FILTER_LABEL: Readonly<Record<StatusFilter, string>> = {
  all: "전체",
  clear: "정복",
  fail: "정복 못함",
  endless: "끝없는 탐험",
  unknown: "모름",
};

/** 상세 모달의 정복 여부 문구. unknown은 "모름"이 아니라 "기록 없음" */
export const STATUS_TEXT: Readonly<Record<GameStatus, string>> = {
  clear: "정복",
  fail: "정복 못함",
  endless: "끝없는 탐험",
  unknown: "기록 없음",
};

export const SORT_LABEL: Readonly<Record<SortKey, string>> = {
  recent: "첫 플레이 최신순",
  old: "첫 플레이 오래된순",
  name: "이름순",
  played: "최근 플레이순",
};

/** 상세의 "마지막 플레이" 칸 값("2026.11.23"). 첫 플레이와 같거나 둘 다 없으면 null(칸을 그리지 않는다) */
export function lastPlayedFact(game: { firstPlayed: string | null; lastPlayed?: string }): string | null {
  const last = lastPlayedOf(game);
  return last === null || last === game.firstPlayed ? null : formatDate(last);
}

/** 연도 목차 이름(챕터를 무슨 날짜의 연도로 묶었나). 정렬 기준 날짜(sortDate)와 같은 축 */
export function chapterAxisLabel(sort: SortKey): string {
  return sort === "played" ? "마지막 플레이 연도" : "첫 플레이 연도";
}

export const VIEW_LABEL: Readonly<Record<ViewKey, string>> = {
  grid: "표지",
  diary: "일지",
};

export function yearLabel(year: YearFilter): string {
  if (year === "all") return "모든 연도"; // 모바일에서 라벨 없이 선택 상자만 보여도 뜻이 통하게
  if (year === "none") return "날짜 기록 없음";
  return year;
}

/** 검색어·정복 여부·연도 중 하나라도 걸려 있는가 ("검색·필터 초기화" 노출 기준) */
export function hasActiveFilter(state: GamesQueryState): boolean {
  return state.q !== "" || hasFilterSelection(state);
}

/** 정복 여부·연도 선택이 걸려 있는가 ("필터 해제" 노출 기준) */
export function hasFilterSelection(state: GamesQueryState): boolean {
  return state.status !== "all" || state.year !== "all";
}

export function describeConditions(state: GamesQueryState): string {
  const parts: string[] = [];
  if (state.q !== "") parts.push(`검색어 "${state.q}"`);
  if (state.status !== "all") parts.push(`정복 여부 ${STATUS_FILTER_LABEL[state.status]}`);
  if (state.year !== "all") parts.push(`연도 ${yearLabel(state.year)}`);
  return parts.length === 0 ? "" : `적용된 조건: ${parts.join(", ")}`;
}

/** 목록 결과 요약. 연도 구분과 같은 형식("N개 · 정복 M"), 상태 필터가 걸리면 정복 수는 뜻이 없어 "N개"만 */
export function resultSummary(total: number, clear: number, state: Pick<GamesQueryState, "status">): string {
  if (total === 0) return "일치하는 게임 0개";
  return state.status === "all" ? `${total}개 · 정복 ${clear}` : `${total}개`;
}

export function vodAriaLabel(vod: Vod): string {
  return `${vod.title}, YouTube ${formatDate(vod.date)} (새 탭에서 열림)`;
}
