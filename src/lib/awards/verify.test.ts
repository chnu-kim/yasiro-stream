import { describe, expect, it } from "vitest";
import { isValidBracket, verifyRun } from "./verify.ts";

const cands = new Set(["a", "b", "c", "d", "e"]);
const run = (over: Record<string, unknown> = {}) => ({
  v: 1,
  division: "alltime",
  bracket: { size: 4, slots: ["a", "b", "c", "d"] },
  thirdPlace: true,
  picks: ["a", "d", "c", "d"],
  ...over,
});

describe("isValidBracket", () => {
  it("받는 모양", () => {
    expect(isValidBracket({ size: 2, slots: ["a", "b"] })).toBe(true);
    expect(isValidBracket({ size: 4, slots: ["a", null, "b", "c"] })).toBe(true);
    expect(isValidBracket({ size: 8, slots: ["a", null, "b", "c", "d", null, "e", "f"] })).toBe(true);
    const big = Array.from({ length: 1024 }, (_, i) => `g${i}`);
    expect(isValidBracket({ size: 1024, slots: big })).toBe(true);
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["배열", []],
    ["문자열", "x"],
    ["size 문자열", { size: "4", slots: ["a", "b", "c", "d"] }],
    ["size 3", { size: 3, slots: ["a", "b", "c"] }],
    ["size 1", { size: 1, slots: ["a"] }],
    ["size 0", { size: 0, slots: [] }],
    ["size 2048", { size: 2048, slots: Array.from({ length: 2048 }, (_, i) => `g${i}`) }],
    ["size 소수", { size: 2.5, slots: ["a", "b"] }],
    ["slots 아님", { size: 2, slots: "ab" }],
    ["길이 불일치", { size: 4, slots: ["a", "b", "c"] }],
    ["숫자 원소", { size: 2, slots: ["a", 1] }],
    ["undefined 원소", { size: 2, slots: ["a", undefined] }],
    ["slots[0] null", { size: 2, slots: [null, "a"] }],
    ["부전승끼리", { size: 4, slots: ["a", "b", null, null] }],
    ["2강 부전승", { size: 2, slots: ["a", null] }],
    ["부전승이 절반", { size: 4, slots: ["a", null, "b", null] }],
    ["중복 id", { size: 4, slots: ["a", "b", "c", "a"] }],
  ])("거부: %s", (_, value) => {
    expect(isValidBracket(value)).toBe(false);
  });
});

describe("verifyRun", () => {
  it("정상 완료(4강·3·4위전)", () => {
    const input = run();
    const r = verifyRun(input, cands);
    expect(r).toEqual({
      ok: true,
      state: input,
      placements: [
        { rank: "champion", id: "d" },
        { rank: "runnerUp", id: "a" },
        { rank: "third", id: "c" },
        { rank: "fourth", id: "b" },
      ],
      tally: {
        a: { wins: 1, losses: 1 },
        b: { wins: 0, losses: 2 },
        c: { wins: 1, losses: 1 },
        d: { wins: 2, losses: 0 },
      },
    });
    // 신뢰할 수 없는 입력 객체를 그대로 돌려주지 않는다
    expect(r.ok && r.state).not.toBe(input);
    expect(r.ok && r.state.bracket.slots).not.toBe(input.bracket.slots);
    expect(r.ok && r.state.picks).not.toBe(input.picks);
  });

  it("부전승 판은 tally에 없다", () => {
    const r = verifyRun(run({ bracket: { size: 4, slots: ["a", null, "b", "c"] }, thirdPlace: false, picks: ["c", "a"] }), cands);
    expect(r.ok && r.tally).toEqual({ a: { wins: 1, losses: 0 }, b: { wins: 0, losses: 1 }, c: { wins: 1, losses: 1 } });
    expect(r.ok && r.placements).toEqual([
      { rank: "champion", id: "a" },
      { rank: "runnerUp", id: "c" },
      { rank: "third", id: "b" },
    ]);
  });

  it("prototype이 null인 객체도 plain 객체로 받는다", () => {
    const obj = Object.assign(Object.create(null) as object, run());
    expect(verifyRun(obj, cands).ok).toBe(true);
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["배열", [run()]],
    ["문자열", "x"],
    ["class 인스턴스", Object.assign(new (class X {})(), run())],
    ["키 하나 더", run({ extra: 1 })],
    ["키 빠짐", { v: 1, division: "alltime", bracket: { size: 2, slots: ["a", "b"] }, thirdPlace: false }],
    ["v 2", run({ v: 2 })],
    ["thirdPlace 문자열", run({ thirdPlace: "true" })],
    ["picks 아님", run({ picks: "a" })],
    ["picks 숫자", run({ picks: ["a", 1] })],
    ["picks 너무 김", run({ picks: Array.from({ length: 1025 }, () => "a") })],
  ])("shape: %s", (_, input) => {
    expect(verifyRun(input, cands)).toEqual({ ok: false, reason: "shape" });
  });

  it("division", () => {
    expect(verifyRun(run({ division: "2025" }), cands)).toEqual({ ok: false, reason: "division" });
    expect(verifyRun(run({ division: "2026" }), cands).ok).toBe(true);
  });

  it("bracket", () => {
    expect(verifyRun(run({ bracket: { size: 4, slots: ["a", "b", null, null] } }), cands)).toEqual({
      ok: false,
      reason: "bracket",
    });
  });

  it("unknownGame", () => {
    expect(verifyRun(run({ bracket: { size: 4, slots: ["a", "b", "c", "z"] } }), cands)).toEqual({
      ok: false,
      reason: "unknownGame",
    });
  });

  it("thirdPlace: 준결승 부전승·결승만인데 3·4위전", () => {
    expect(verifyRun(run({ bracket: { size: 4, slots: ["a", null, "b", "c"] }, picks: ["c", "a"] }), cands)).toEqual({
      ok: false,
      reason: "thirdPlace",
    });
    expect(verifyRun(run({ bracket: { size: 2, slots: ["a", "b"] }, picks: ["a"] }), cands)).toEqual({
      ok: false,
      reason: "thirdPlace",
    });
  });

  it("pick·extra는 위치와 함께", () => {
    expect(verifyRun(run({ picks: ["a", "a"] }), cands)).toEqual({ ok: false, reason: "pick", at: 1 });
    expect(verifyRun(run({ picks: ["a", "d", "c", "d", "d"] }), cands)).toEqual({ ok: false, reason: "extra", at: 4 });
  });

  it("incomplete", () => {
    expect(verifyRun(run({ picks: ["a", "d", "c"] }), cands)).toEqual({ ok: false, reason: "incomplete" });
    expect(verifyRun(run({ picks: [] }), cands)).toEqual({ ok: false, reason: "incomplete" });
  });
});
