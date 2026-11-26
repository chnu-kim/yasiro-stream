import { describe, expect, it } from "vitest";
import { CATEGORY_CARD, CEREMONY_EYEBROW, ceremonyLines, DIVISION_AWARD, JUDGE_SEAT_LABEL, fitText, JUDGE_TITLE, RESULTS_LINK_LABEL, SETTINGS_LABEL, settingsSummary, START_LABEL, PAGE_TITLE, RANKINGS_PAGE_TITLE, matchAnnouncement, placementLabel, progressLabel, resultSummary, sizeLabel, thirdPlaceNote } from "./labels.ts";
import { sizeOptions } from "./options.ts";
import type { Placement, Progress } from "./types.ts";

const prog = (label: string, matchNo: number, matchCount: number): Progress => ({ label, matchNo, matchCount, done: 0, total: 1 });

describe("sizeLabel / fitText", () => {
  it("보이는 강만, '모두' 없음", () => {
    const o = sizeOptions(338);
    expect(o.map(sizeLabel)).toEqual(["4강", "16강", "32강", "64강", "128강", "256강", "512강"]);
    expect(fitText(o[1], 338)).toBe("338개 중 16개를 무작위로 뽑아요.");
    expect(sizeOptions(92).map(sizeLabel).at(-1)).toBe("128강");
  });
  it("exact·byes", () => {
    expect(fitText(sizeOptions(16)[1], 16)).toBe("후보 16개가 모두 나와요.");
    expect(fitText(sizeOptions(10)[1], 10)).toBe("후보 10개가 모두 나오고, 6자리는 부전승이에요.");
  });
});

describe("thirdPlaceNote", () => {
  it("가능하면 null, 결승만·부전승 준결승은 이유", () => {
    expect(thirdPlaceNote(16, 10)).toBeNull();
    expect(thirdPlaceNote(4, 4)).toBeNull();
    expect(thirdPlaceNote(2, 2)).toBe("결승 한 판이라 3·4위전이 없어요.");
    expect(thirdPlaceNote(0, 1)).toBe("결승 한 판이라 3·4위전이 없어요.");
    expect(thirdPlaceNote(4, 3)).toBe("준결승에 부전승이 있어 3·4위전을 할 수 없어요.");
  });
});

describe("progressLabel / matchAnnouncement / resultSummary", () => {
  it("라벨 규칙", () => {
    expect(progressLabel(prog("16강", 3, 8))).toBe("16강 3/8");
    expect(progressLabel(prog("4강", 1, 1))).toBe("4강 1/1");
    expect(progressLabel(prog("결승", 1, 1))).toBe("결승");
    expect(progressLabel(prog("3·4위전", 1, 1))).toBe("3·4위전");
    expect(matchAnnouncement(prog("16강", 3, 8), "가", "나")).toBe("16강 3/8 · 가 대 나");
    expect(resultSummary("올타임 부문", 16, 16)).toBe("올타임 부문 · 16강 · 전체 16판");
  });
});

describe("placementLabel", () => {
  it("순위 이름", () => {
    const ranks: Placement["rank"][] = ["champion", "runnerUp", "third", "fourth", "jointThird"];
    expect(ranks.map(placementLabel)).toEqual(["우승", "준우승", "3위", "4위", "공동 3위"]);
  });
});

describe("페이지 제목", () => {
  it("어워즈·순위 페이지", () => {
    expect(PAGE_TITLE).toBe("2026 야시로 게임 어워즈");
    expect(RANKINGS_PAGE_TITLE).toBe("게임 어워즈 집계 순위");
  });
  it("부문 상 이름", () => {
    expect(DIVISION_AWARD).toEqual({ alltime: "Best Game of All Time", "2026": "Best Game of 2026" });
  });
});

describe("입장 화면 문구", () => {
  it("자막 두 줄(후보 수는 강조)", () => {
    expect(ceremonyLines(92)).toEqual([
      ["올해 야시로가 탐험한 게임, ", "92편"],
      ["그중 단 한 편만 이 트로피를 받습니다", ""],
    ]);
  });
  it("버튼·링크·모달 제목", () => {
    expect([START_LABEL, SETTINGS_LABEL, RESULTS_LINK_LABEL, JUDGE_TITLE]).toEqual([
      "심사 시작하기",
      "심사 방식 바꾸기",
      "지금까지의 심사 결과",
      "2026 야시로 게임 어워즈 심사위원",
    ]);
  });
  it("의전 라벨·부문 카드", () => {
    expect(CEREMONY_EYEBROW).toBe("The 2026 Yasiro Game Awards");
    expect(JUDGE_SEAT_LABEL).toBe("Judge's Seat");
    expect(CATEGORY_CARD).toEqual({ "2026": ["Best Game of 2026", "올해의 게임 부문"], alltime: ["All-Time", "역대 최고의 게임 부문"] });
  });
  it("심사 방식 한 줄", () => {
    const o = sizeOptions(92)[1];
    expect(settingsSummary("2026 부문", o, false)).toBe("2026 부문 · 16강");
    expect(settingsSummary("2026 부문", o, true)).toBe("2026 부문 · 16강 · 3·4위전");
    expect(settingsSummary("올타임 부문", undefined, false)).toBe("올타임 부문");
  });
});
