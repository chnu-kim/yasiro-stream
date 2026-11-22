import { describe, expect, it } from "vitest";
import {
  canRetrySubmit,
  classifyDraw,
  classifyRankings,
  classifySubmit,
  drawFailureMessage,
  emptyRankingText,
  rankingStatsText,
  rankingsFailureMessage,
  RANKINGS_FAILURE_TEXT,
  runsSummaryText,
  submitStatusText,
  winRateNote,
  winRateText,
  type DrawFailure,
  type SubmitFailure,
} from "./client.ts";

const run = { v: 1, division: "alltime", bracket: { size: 4, slots: ["a", "b", "c", "d"] }, thirdPlace: true, picks: [] };
const known = new Set(["a", "b", "c", "d"]);

describe("classifyDraw", () => {
  it("200: 모양이 맞고 게임을 모두 알면 ok", () => {
    expect(classifyDraw(200, { token: "t", run, expiresAt: 1 }, known)).toEqual({ ok: true, run, token: "t" });
  });
  it("부전승(null) 칸은 알려진 id 검사에서 빠진다", () => {
    const bye = { ...run, bracket: { size: 4, slots: ["a", "b", "c", null] }, thirdPlace: false };
    expect(classifyDraw(200, { token: "t", run: bye }, known).ok).toBe(true);
  });
  it("200이어도 모양이 틀리면 unknown", () => {
    const bad = [
      null,
      [],
      { run },
      { token: 1, run },
      { token: "t" },
      { token: "t", run: null },
      { token: "t", run: { ...run, v: 2 } },
      { token: "t", run: { ...run, division: "x" } },
      { token: "t", run: { ...run, division: 5 } },
      { token: "t", run: { ...run, thirdPlace: "y" } },
      { token: "t", run: { ...run, picks: "a" } },
      { token: "t", run: { ...run, picks: ["a"] } },
      { token: "t", run: { ...run, bracket: { size: 3, slots: [] } } },
    ];
    for (const b of bad) expect(classifyDraw(200, b, known)).toEqual({ ok: false, reason: "unknown" });
  });
  it("목록에 없는 게임이 있으면 stale", () => {
    expect(classifyDraw(200, { token: "t", run }, new Set(["a", "b", "c"]))).toEqual({ ok: false, reason: "stale" });
  });
  it("상태 코드별 실패 사유", () => {
    const r = (s: number) => classifyDraw(s, null, known);
    expect(r(0)).toEqual({ ok: false, reason: "network" });
    expect(r(401)).toEqual({ ok: false, reason: "login" });
    expect(r(403)).toEqual({ ok: false, reason: "forbidden" });
    expect(r(422)).toEqual({ ok: false, reason: "size" });
    expect(r(503)).toEqual({ ok: false, reason: "unconfigured" });
    expect(r(500)).toEqual({ ok: false, reason: "unknown" });
  });
  it("문구는 사유마다 있다", () => {
    const reasons: DrawFailure[] = ["network", "login", "forbidden", "unconfigured", "size", "stale", "unknown"];
    const texts = reasons.map(drawFailureMessage);
    expect(new Set(texts).size).toBe(reasons.length);
    expect(drawFailureMessage("unconfigured")).toBe("어워즈 설정이 끝나지 않아 시작할 수 없어요.");
  });
});

describe("classifySubmit", () => {
  it("상태 코드별", () => {
    const f = (reason: SubmitFailure) => ({ kind: "failed", reason });
    expect(classifySubmit(200, false)).toEqual({ kind: "done" });
    expect(classifySubmit(0, false)).toEqual(f("network"));
    expect(classifySubmit(401, false)).toEqual(f("login"));
    expect(classifySubmit(403, false)).toEqual(f("forbidden"));
    expect(classifySubmit(409, false)).toEqual(f("duplicate"));
    expect(classifySubmit(410, false)).toEqual(f("expired"));
    expect(classifySubmit(429, false)).toEqual(f("limit"));
    expect(classifySubmit(503, false)).toEqual(f("unconfigured"));
    expect(classifySubmit(500, false)).toEqual(f("unknown"));
    expect(classifySubmit(422, true)).toEqual(f("unknown"));
  });
  it("재시도에서 409는 앞선 요청이 들어간 것이라 done", () => {
    expect(classifySubmit(409, true)).toEqual({ kind: "done" });
  });
  it("재시도에서 429는 앞선 요청이 들어갔을 수 있어 limitUnsure", () => {
    expect(classifySubmit(429, true)).toEqual({ kind: "failed", reason: "limitUnsure" });
    expect(classifySubmit(429, false)).toEqual({ kind: "failed", reason: "limit" });
  });
  it("문구", () => {
    expect(submitStatusText({ kind: "sending", retried: false })).toBe("집계에 반영하는 중…");
    expect(submitStatusText({ kind: "done" })).toBe("집계에 반영됐어요.");
    const t = (reason: SubmitFailure) => submitStatusText({ kind: "failed", reason });
    expect(t("limit")).toBe("오늘 이 부문은 10번까지 집계돼요. 이번 결과는 반영되지 않았어요.");
    expect(t("limitUnsure")).toBe("오늘 이 부문은 10번까지 집계돼요. 끊긴 요청이 이미 반영됐을 수 있어요.");
    expect(t("duplicate")).toBe("이미 집계에 반영된 대진이에요.");
    expect(t("expired")).toBe("대진을 뽑은 지 24시간이 지나 집계에 넣지 못했어요.");
    expect(t("network")).toBe("연결이 끊겨 집계에 반영하지 못했어요.");
    expect(t("login")).toBe("로그인이 만료돼 집계에 반영하지 못했어요.");
    for (const r of ["forbidden", "unconfigured", "unknown"] as const) expect(t(r)).toBe("집계에 반영하지 못했어요.");
  });
  it("재시도 버튼은 네트워크 실패에만", () => {
    expect(canRetrySubmit({ kind: "failed", reason: "network" })).toBe(true);
    expect(canRetrySubmit({ kind: "failed", reason: "limit" })).toBe(false);
    expect(canRetrySubmit({ kind: "failed", reason: "limitUnsure" })).toBe(false);
    expect(canRetrySubmit({ kind: "done" })).toBe(false);
    expect(canRetrySubmit({ kind: "sending", retried: true })).toBe(false);
  });
});

describe("classifyRankings", () => {
  const row = { id: "a", appearances: 3, championships: 1, wins: 3, losses: 1 };
  const ok = { division: "2026", runs: 4, minMatches: 10, byChampionships: [row], byWinRate: [] };
  it("200 정상", () => {
    expect(classifyRankings(200, ok)).toEqual({ ok: true, data: ok });
  });
  it("상태 코드별 실패", () => {
    expect(classifyRankings(0, null)).toEqual({ ok: false, reason: "network" });
    expect(classifyRankings(401, null)).toEqual({ ok: false, reason: "login" });
    expect(classifyRankings(403, null)).toEqual({ ok: false, reason: "forbidden" });
    expect(classifyRankings(500, ok)).toEqual({ ok: false, reason: "unknown" });
  });
  it("200이어도 모양이 틀리면 unknown", () => {
    const bad = [
      null,
      [],
      { ...ok, division: "x" },
      { ...ok, division: 1 },
      { ...ok, runs: -1 },
      { ...ok, minMatches: "10" },
      { ...ok, byChampionships: "a" },
      { ...ok, byChampionships: [{ ...row, id: 1 }] },
      { ...ok, byChampionships: [null] },
      { ...ok, byWinRate: [{ ...row, wins: 1.5 }] },
      { ...ok, byWinRate: "a" },
    ];
    for (const b of bad) expect(classifyRankings(200, b)).toEqual({ ok: false, reason: "unknown" });
  });
  it("실패 문구", () => {
    expect(rankingsFailureMessage("login")).toBe("로그인이 만료됐어요. 다시 로그인해 주세요.");
    for (const r of ["network", "forbidden", "unknown"] as const) expect(rankingsFailureMessage(r)).toBe("순위를 불러오지 못했어요.");
    expect(RANKINGS_FAILURE_TEXT).toBe("순위를 불러오지 못했어요.");
  });
});

describe("순위 문구", () => {
  it("승률은 반올림, 0판은 —", () => {
    expect(winRateText(0, 0)).toBe("—");
    expect(winRateText(3, 1)).toBe("75%");
    expect(winRateText(1, 2)).toBe("33%");
    expect(winRateText(0, 5)).toBe("0%");
  });
  it("행 통계·요약·메모·빈 목록", () => {
    expect(rankingStatsText({ id: "a", appearances: 16, championships: 3, wins: 12, losses: 4 })).toBe("우승 3 · 12승 4패 · 승률 75%");
    expect(runsSummaryText(12)).toBe("집계된 대진 12판");
    expect(winRateNote(10)).toBe("대결 10판 이상인 게임만 보여요.");
    expect(emptyRankingText(0, "winRate")).toBe("아직 집계된 대진이 없어요.");
    expect(emptyRankingText(0, "championships")).toBe("아직 집계된 대진이 없어요.");
    expect(emptyRankingText(3, "championships")).toBe("아직 집계된 대진이 없어요.");
    expect(emptyRankingText(3, "winRate")).toBe("대결 10판을 채운 게임이 아직 없어요.");
  });
});
