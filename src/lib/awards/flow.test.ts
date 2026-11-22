import { describe, expect, it } from "vitest";
import { focusHeadingAfter, inProgress, INITIAL_SCREEN, newRun, reduce, type Screen } from "./flow.ts";
import { currentMatch } from "./tournament.ts";

const ids = ["a", "b", "c", "d"];
const run0 = () => newRun(ids, "alltime", 4, true, () => 0);

function pickFirst(screen: Screen): Screen {
  if (screen.kind !== "play") throw new Error("not play");
  const m = currentMatch(screen.run)!;
  return reduce(screen, { type: "pick", winnerId: m.a, expectedIndex: m.pickIndex });
}

describe("newRun", () => {
  it("후보로 대진을 뽑아 시작 상태를 만든다(rng 주입)", () => {
    const run = run0();
    expect(run).toMatchObject({ v: 1, division: "alltime", thirdPlace: true, picks: [] });
    expect([...run.bracket.slots].sort()).toEqual(ids);
  });
  it("부전승 대진, 후보 부족은 던진다", () => {
    expect(newRun(["a", "b", "c"], "2026", 4, true, () => 0).thirdPlace).toBe(false);
    expect(() => newRun(["a", "b"], "alltime", 4, true, () => 0)).toThrow(RangeError);
  });
});

describe("reduce", () => {
  it("start → pick … → result, 같은 값 재입력은 no-op", () => {
    let s = reduce(INITIAL_SCREEN, { type: "start", run: run0(), token: "tok" });
    expect(s.kind).toBe("play");
    const m = s.kind === "play" ? currentMatch(s.run)! : null!;
    s = pickFirst(s);
    expect(s.kind === "play" && s.run.picks).toHaveLength(1);
    const dup = reduce(s, { type: "pick", winnerId: m.a, expectedIndex: m.pickIndex });
    expect(dup).toBe(s);
    s = pickFirst(s);
    s = pickFirst(s);
    expect(s.kind).toBe("play");
    s = pickFirst(s);
    expect(s.kind).toBe("result");
    expect(s.kind === "result" && s.run.picks).toHaveLength(4);
  });

  it("다른 화면에서의 pick·undo는 같은 객체", () => {
    const result = (() => {
      let s: Screen = reduce(INITIAL_SCREEN, { type: "start", run: run0(), token: "tok" });
      for (let i = 0; i < 4; i++) s = pickFirst(s);
      return s;
    })();
    expect(reduce(INITIAL_SCREEN, { type: "pick", winnerId: "a", expectedIndex: 0 })).toBe(INITIAL_SCREEN);
    expect(reduce(INITIAL_SCREEN, { type: "undo" })).toBe(INITIAL_SCREEN);
    expect(reduce(result, { type: "pick", winnerId: "a", expectedIndex: 4 })).toBe(result);
    expect(reduce(result, { type: "undo" })).toBe(result);
  });

  it("undo: 빈 picks는 같은 객체, 그 밖은 한 판 되돌림", () => {
    const start = reduce(INITIAL_SCREEN, { type: "start", run: run0(), token: "tok" });
    expect(reduce(start, { type: "undo" })).toBe(start);
    const picked = pickFirst(start);
    const back = reduce(picked, { type: "undo" });
    expect(back).toEqual(start);
  });

  it("restart: 어디서든 setup, setup이면 같은 객체", () => {
    const start = reduce(INITIAL_SCREEN, { type: "start", run: run0(), token: "tok" });
    expect(reduce(start, { type: "restart" })).toEqual({ kind: "setup" });
    expect(reduce(INITIAL_SCREEN, { type: "restart" })).toBe(INITIAL_SCREEN);
  });
});

describe("token·rankings", () => {
  it("start의 token이 play·result까지 따라간다", () => {
    let s = reduce(INITIAL_SCREEN, { type: "start", run: run0(), token: "tok" });
    expect(s.kind === "play" && s.token).toBe("tok");
    s = pickFirst(s);
    expect(s.kind === "play" && s.token).toBe("tok");
    s = reduce(s, { type: "undo" });
    expect(s.kind === "play" && s.token).toBe("tok");
    for (let i = 0; i < 4; i++) s = pickFirst(s);
    expect(s.kind === "result" && s.token).toBe("tok");
  });
});

describe("inProgress", () => {
  it("한 판 이상 골랐고 끝나지 않았을 때만", () => {
    const start = reduce(INITIAL_SCREEN, { type: "start", run: run0(), token: "tok" });
    expect(inProgress(INITIAL_SCREEN)).toBe(false);
    expect(inProgress(start)).toBe(false);
    const picked = pickFirst(start);
    expect(inProgress(picked)).toBe(true);
    let s = picked;
    for (let i = 0; i < 3; i++) s = pickFirst(s);
    expect(inProgress(s)).toBe(false);
  });
});

describe("focusHeadingAfter", () => {
  const start = () => reduce(INITIAL_SCREEN, { type: "start", run: run0(), token: "tok" });
  it("설정 → 대결: 시작 버튼이 사라지므로 대결 제목으로 옮긴다", () => {
    expect(focusHeadingAfter(INITIAL_SCREEN, start())).toBe(true);
  });
  it("대결 → 결과, 결과·대결 → 설정: 제목으로 옮긴다", () => {
    let s = start();
    for (let i = 0; i < 3; i++) s = pickFirst(s);
    const result = pickFirst(s);
    expect(result.kind).toBe("result");
    expect(focusHeadingAfter(s, result)).toBe(true);
    expect(focusHeadingAfter(result, INITIAL_SCREEN)).toBe(true);
    expect(focusHeadingAfter(start(), INITIAL_SCREEN)).toBe(true);
  });
  it("대결 중 고르기·중간 되돌리기: 포커스는 카드·버튼에 남는다", () => {
    const s0 = start();
    const s1 = pickFirst(s0);
    const s2 = pickFirst(s1);
    expect(focusHeadingAfter(s0, s1)).toBe(false);
    expect(focusHeadingAfter(s2, reduce(s2, { type: "undo" }))).toBe(false);
  });
  it("첫 판까지 되돌리기: 되돌리기 버튼이 비활성이 되므로 제목으로 옮긴다", () => {
    const s1 = pickFirst(start());
    expect(focusHeadingAfter(s1, reduce(s1, { type: "undo" }))).toBe(true);
  });
  it("같은 화면(무효 액션)이면 옮기지 않는다", () => {
    const s0 = start();
    expect(focusHeadingAfter(s0, s0)).toBe(false);
    expect(focusHeadingAfter(INITIAL_SCREEN, INITIAL_SCREEN)).toBe(false);
  });
});
