import { describe, expect, it } from "vitest";
import {
  describeConditions,
  hasActiveFilter,
  hasFilterSelection,
  resultSummary,
  SORT_LABEL,
  STATUS_FILTER_LABEL,
  STATUS_TEXT,
  vodAriaLabel,
  yearLabel,
} from "./labels.ts";
import { DEFAULT_QUERY_STATE } from "./query.ts";
import type { GamesQueryState } from "./types.ts";

const state = (patch: Partial<GamesQueryState> = {}): GamesQueryState => ({
  ...DEFAULT_QUERY_STATE,
  ...patch,
});

describe("라벨 상수", () => {
  it("정복 여부 필터 라벨", () => {
    expect(STATUS_FILTER_LABEL).toEqual({
      all: "전체",
      clear: "정복",
      fail: "정복 못함",
      endless: "끝없는 탐험",
      unknown: "모름",
    });
  });
  it("상세의 정복 여부 문구: unknown은 기록 없음", () => {
    expect(STATUS_TEXT).toEqual({ clear: "정복", fail: "정복 못함", endless: "끝없는 탐험", unknown: "기록 없음" });
  });
  it("정렬 라벨", () => {
    expect(SORT_LABEL).toEqual({
      recent: "첫 플레이 최신순",
      old: "첫 플레이 오래된순",
      name: "이름순",
    });
  });
});

describe("yearLabel", () => {
  it("all / none / 연도", () => {
    expect(yearLabel("all")).toBe("모든 연도");
    expect(yearLabel("none")).toBe("날짜 기록 없음");
    expect(yearLabel("2025")).toBe("2025");
  });
});

describe("hasActiveFilter / hasFilterSelection", () => {
  it("기본 상태는 둘 다 false", () => {
    expect(hasActiveFilter(state())).toBe(false);
    expect(hasFilterSelection(state())).toBe(false);
  });
  it("검색어만 있으면 active, 필터 선택은 아님", () => {
    expect(hasActiveFilter(state({ q: "컵" }))).toBe(true);
    expect(hasFilterSelection(state({ q: "컵" }))).toBe(false);
  });
  it("status 또는 year가 기본이 아니면 둘 다 true", () => {
    expect(hasActiveFilter(state({ status: "fail" }))).toBe(true);
    expect(hasFilterSelection(state({ status: "fail" }))).toBe(true);
    expect(hasActiveFilter(state({ year: "none" }))).toBe(true);
    expect(hasFilterSelection(state({ year: "2025" }))).toBe(true);
  });
  it("정렬과 페이지는 영향 없음", () => {
    expect(hasActiveFilter(state({ sort: "name", view: "diary" }))).toBe(false);
    expect(hasFilterSelection(state({ sort: "name", view: "diary" }))).toBe(false);
  });
});

describe("describeConditions", () => {
  it("조건이 없으면 빈 문자열", () => {
    expect(describeConditions(state())).toBe("");
  });
  it("모든 조건을 순서대로 나열한다", () => {
    expect(describeConditions(state({ q: "컵", status: "fail", year: "2025" }))).toBe(
      '적용된 조건: 검색어 "컵", 정복 여부 정복 못함, 연도 2025',
    );
  });
  it("year none은 날짜 기록 없음", () => {
    expect(describeConditions(state({ year: "none" }))).toBe("적용된 조건: 연도 날짜 기록 없음");
  });
  it("status만", () => {
    expect(describeConditions(state({ status: "unknown" }))).toBe("적용된 조건: 정복 여부 모름");
  });
});

describe("resultSummary", () => {
  it("연도 구분과 같은 형식: 개수 · 정복 수", () => {
    expect(resultSummary(371, 242, state())).toBe("371개 · 정복 242");
    expect(resultSummary(1, 0, state({ q: "x" }))).toBe("1개 · 정복 0");
  });
  it("상태 필터가 걸리면 정복 수를 적지 않는다", () => {
    expect(resultSummary(73, 0, state({ status: "fail" }))).toBe("73개");
  });
  it("0건", () => {
    expect(resultSummary(0, 0, state({ q: "없는게임" }))).toBe("일치하는 게임 0개");
  });
});

describe("vodAriaLabel", () => {
  it("제목, 날짜, 새 탭 안내", () => {
    expect(vodAriaLabel({ title: "컵헤드 했어요", url: "x", date: "2025-08-01" })).toBe(
      "컵헤드 했어요, YouTube 2025.08.01 (새 탭에서 열림)",
    );
  });
});
