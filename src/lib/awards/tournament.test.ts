import { describe, expect, it } from "vitest";
import { drawBracket } from "./draw.ts";
import { nextPow2, sizeEnabled, sizeOptions, thirdPlaceAvailable } from "./options.ts";
import {
  currentMatch,
  entrantCount,
  isComplete,
  pick,
  placements,
  progress,
  replay,
  roundLabel,
  startTournament,
  tally,
  THIRD_PLACE_LABEL,
  totalMatches,
  undo,
} from "./tournament.ts";
import type { Bracket, Match, TournamentState } from "./types.ts";
import { verifyRun } from "./verify.ts";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const br = (slots: (string | null)[]): Bracket => ({ size: slots.length, slots });
const start = (slots: (string | null)[], third = true) => startTournament("alltime", br(slots), third);

function cur(s: TournamentState): Match {
  const m = currentMatch(s);
  if (m === null) throw new Error("끝난 상태");
  return m;
}
/** 현재 판의 a·b와 위치만 */
const shape = (m: Match) => [m.kind, m.round, m.index, m.a, m.b];
const prog = (s: TournamentState) => {
  const p = progress(s);
  return `${p.label} ${p.matchNo}/${p.matchCount}`;
};
const go = (s: TournamentState, id: string) => pick(s, id, s.picks.length);

describe("roundLabel", () => {
  it("2 → 결승, 그 밖 n강", () => {
    expect(roundLabel(2)).toBe("결승");
    expect(roundLabel(4)).toBe("4강");
    expect(roundLabel(512)).toBe("512강");
    expect(THIRD_PLACE_LABEL).toBe("3·4위전");
  });
});

describe("startTournament", () => {
  it("요청 && 가능일 때만 thirdPlace", () => {
    expect(start(["a", "b", "c", "d"], true).thirdPlace).toBe(true);
    expect(start(["a", "b", "c", "d"], false).thirdPlace).toBe(false);
    expect(start(["a", null, "b", "c"], true).thirdPlace).toBe(false);
    expect(start(["a", "b"], true).thirdPlace).toBe(false);
  });

  it("상태 모양: v 1, 빈 picks, bracket 복사", () => {
    const b = br(["a", "b", "c", "d"]);
    const s = startTournament("2026", b, true);
    expect(s).toEqual({ v: 1, division: "2026", bracket: b, thirdPlace: true, picks: [] });
    expect(s.bracket).not.toBe(b);
    expect(s.bracket.slots).not.toBe(b.slots);
  });

  it("entrantCount·totalMatches", () => {
    expect(entrantCount(br(["a", null, "b", "c"]))).toBe(3);
    expect(totalMatches(start(["a", "b", "c", "d"]))).toBe(4);
    expect(totalMatches(start(["a", "b", "c", "d"], false))).toBe(3);
    expect(totalMatches(start(["a", null, "b", "c"]))).toBe(2);
  });
});

describe("4강 꽉 참", () => {
  it("3·4위전 켬: 결승 직전에 3·4위전", () => {
    let s = start(["a", "b", "c", "d"]);
    const seen: string[] = [];
    seen.push(prog(s));
    expect(shape(cur(s))).toEqual(["main", 0, 0, "a", "b"]);
    s = go(s, "a");
    seen.push(prog(s));
    expect(shape(cur(s))).toEqual(["main", 0, 1, "c", "d"]);
    s = go(s, "d");
    seen.push(prog(s));
    expect(shape(cur(s))).toEqual(["third", 1, 0, "b", "c"]);
    expect(cur(s).pickIndex).toBe(2);
    s = go(s, "c");
    seen.push(prog(s));
    expect(shape(cur(s))).toEqual(["main", 1, 0, "a", "d"]);
    expect(isComplete(s)).toBe(false);
    expect(placements(s)).toBeNull();
    s = go(s, "d");
    expect(seen).toEqual(["4강 1/2", "4강 2/2", "3·4위전 1/1", "결승 1/1"]);
    expect(isComplete(s)).toBe(true);
    expect(currentMatch(s)).toBeNull();
    expect(placements(s)).toEqual([
      { rank: "champion", id: "d" },
      { rank: "runnerUp", id: "a" },
      { rank: "third", id: "c" },
      { rank: "fourth", id: "b" },
    ]);
    expect(progress(s)).toEqual({ label: "결승", matchNo: 1, matchCount: 1, done: 4, total: 4 });
    expect(tally(s)).toEqual({
      a: { wins: 1, losses: 1 },
      b: { wins: 0, losses: 2 },
      c: { wins: 1, losses: 1 },
      d: { wins: 2, losses: 0 },
    });
  });

  it("3·4위전 끔: 공동 3위 둘(준결승 0번 쪽 먼저)", () => {
    let s = start(["a", "b", "c", "d"], false);
    for (const id of ["a", "d"]) s = go(s, id);
    expect(prog(s)).toBe("결승 1/1");
    s = go(s, "d");
    expect(s.picks).toHaveLength(3);
    expect(placements(s)).toEqual([
      { rank: "champion", id: "d" },
      { rank: "runnerUp", id: "a" },
      { rank: "jointThird", id: "b" },
      { rank: "jointThird", id: "c" },
    ]);
  });
});

describe("4강·N=3", () => {
  it("부전승은 판에 넣지 않고, 준결승 패자 하나가 3위", () => {
    let s = start(["a", null, "b", "c"], true);
    expect(s.thirdPlace).toBe(false);
    expect(shape(cur(s))).toEqual(["main", 0, 1, "b", "c"]);
    expect(cur(s).pickIndex).toBe(0);
    expect(prog(s)).toBe("4강 1/1");
    s = go(s, "c");
    expect(shape(cur(s))).toEqual(["main", 1, 0, "a", "c"]);
    expect(prog(s)).toBe("결승 1/1");
    s = go(s, "a");
    expect(placements(s)).toEqual([
      { rank: "champion", id: "a" },
      { rank: "runnerUp", id: "c" },
      { rank: "third", id: "b" },
    ]);
    expect(totalMatches(s)).toBe(2);
    expect(tally(s)).toEqual({ a: { wins: 1, losses: 0 }, b: { wins: 0, losses: 1 }, c: { wins: 1, losses: 1 } });
  });
});

describe("결승만", () => {
  it("2강: 결승 한 판, 우승·준우승만", () => {
    let s = start(["a", "b"], true);
    expect(s.thirdPlace).toBe(false);
    expect(prog(s)).toBe("결승 1/1");
    expect(progress(s)).toEqual({ label: "결승", matchNo: 1, matchCount: 1, done: 0, total: 1 });
    s = go(s, "b");
    expect(placements(s)).toEqual([
      { rank: "champion", id: "b" },
      { rank: "runnerUp", id: "a" },
    ]);
  });
});

describe("16강·N=10", () => {
  it("라운드 0 실제 판 2개 → 8강 4판", () => {
    const bracket = drawBracket(
      Array.from({ length: 10 }, (_, i) => `g${i}`),
      16,
      mulberry32(5),
    );
    for (const third of [true, false]) {
      let s = startTournament("alltime", bracket, third);
      expect(totalMatches(s)).toBe(third ? 10 : 9);
      const labels: string[] = [];
      while (!isComplete(s)) {
        labels.push(prog(s));
        s = go(s, cur(s).a);
      }
      expect(labels.slice(0, 7)).toEqual(["16강 1/2", "16강 2/2", "8강 1/4", "8강 2/4", "8강 3/4", "8강 4/4", "4강 1/2"]);
      expect(labels.slice(7)).toEqual(third ? ["4강 2/2", "3·4위전 1/1", "결승 1/1"] : ["4강 2/2", "결승 1/1"]);
      expect(progress(s).done).toBe(s.picks.length);
    }
  });
});

describe("tally", () => {
  it("Object.prototype에 있는 이름(constructor·toString)도 자기 키로 센다", () => {
    let s = start(["constructor", "toString", "c", "d"], false);
    for (const id of ["constructor", "c", "constructor"]) s = go(s, id);
    const t = tally(s);
    expect(Object.hasOwn(t, "constructor")).toBe(true);
    expect(t).toEqual({
      constructor: { wins: 2, losses: 0 },
      toString: { wins: 0, losses: 1 },
      c: { wins: 1, losses: 1 },
      d: { wins: 0, losses: 1 },
    });
  });
});

describe("pick·undo", () => {
  const s0 = start(["a", "b", "c", "d"]);

  it("무효 pick은 같은 참조", () => {
    expect(pick(s0, "a", 1)).toBe(s0);
    expect(pick(s0, "c", 0)).toBe(s0);
    expect(pick(s0, "zz", 0)).toBe(s0);
    let done = s0;
    for (const id of ["a", "c", "b", "a"]) done = go(done, id);
    expect(isComplete(done)).toBe(true);
    expect(pick(done, "a", done.picks.length)).toBe(done);
  });

  it("정상 pick은 새 객체, 원래 picks 불변. b 쪽도 고를 수 있다", () => {
    const s1 = pick(s0, "b", 0);
    expect(s1).not.toBe(s0);
    expect(s1.picks).toEqual(["b"]);
    expect(s0.picks).toEqual([]);
  });

  it("더블탭: 같은 expectedIndex 두 번째는 무시", () => {
    const s1 = pick(s0, "a", 0);
    expect(pick(s1, "a", 0)).toBe(s1);
  });

  it("undo", () => {
    expect(undo(s0)).toBe(s0);
    const s1 = go(s0, "a");
    expect(undo(s1).picks).toEqual(s0.picks);
    expect(s1.picks).toEqual(["a"]);
    let s = s0;
    for (const id of ["a", "d", "c"]) s = go(s, id);
    expect(cur(s).kind).toBe("main");
    expect(cur(undo(s)).kind).toBe("third");
  });
});

describe("replay", () => {
  const bracket = br(["a", "b", "c", "d"]);
  it("대진에 없는 id → pick at", () => {
    expect(replay({ bracket, thirdPlace: false, picks: ["a", "zz"] })).toEqual({
      ok: false,
      error: { reason: "pick", at: 1 },
    });
  });
  it("끝난 뒤 남는 pick → extra at total", () => {
    expect(replay({ bracket, thirdPlace: false, picks: ["a", "c", "a", "a", "a"] })).toEqual({
      ok: false,
      error: { reason: "extra", at: 3 },
    });
  });
  it("played·current", () => {
    const r = replay({ bracket, thirdPlace: false, picks: ["b"] });
    expect(r.ok && r.value.played).toEqual([
      { kind: "main", round: 0, index: 0, pickIndex: 0, a: "a", b: "b", winner: "b", loser: "a" },
    ]);
    expect(r.ok && r.value.current).toEqual({ kind: "main", round: 0, index: 1, pickIndex: 1, a: "c", b: "d" });
  });
  it("준결승이 실제 판이 아닌데 thirdPlace면 던진다(신뢰된 상태의 불변식 위반)", () => {
    expect(() => replay({ bracket: br(["a", null, "b", "c"]), thirdPlace: true, picks: [] })).toThrow();
    expect(() => replay({ bracket: br(["a", "b"]), thirdPlace: true, picks: [] })).toThrow();
  });
  it("조회 함수는 잘못된 상태에 던진다", () => {
    const bad: TournamentState = { ...start(["a", "b"]), picks: ["zz"] };
    expect(() => currentMatch(bad)).toThrow();
    expect(() => progress(bad)).toThrow();
  });
});

describe("순수성", () => {
  it("입력을 바꾸지 않고, JSON 왕복 뒤에도 결과가 같다", () => {
    let s = start(["a", null, "b", "c", "d", "e", "f", null]);
    const steps: TournamentState[] = [s];
    while (!isComplete(s)) {
      s = go(s, cur(s).b);
      steps.push(s);
    }
    for (const st of steps) {
      const snap = structuredClone(st);
      currentMatch(st);
      progress(st);
      placements(st);
      tally(st);
      replay(st);
      undo(st);
      pick(st, "a", st.picks.length);
      isComplete(st);
      expect(st).toEqual(snap);
      const rt = JSON.parse(JSON.stringify(st)) as TournamentState;
      expect(replay(rt)).toEqual(replay(st));
      expect(placements(rt)).toEqual(placements(st));
    }
  });
});

describe("성질: 모든 N(2..300) × 모든 활성 강 × 3·4위전", () => {
  it("끝까지 무작위로 고르면 우승 1명, 판 수·승패가 맞고 verifyRun과 같다", () => {
    const rng = mulberry32(42);
    for (let n = 2; n <= 300; n++) {
      const all = Array.from({ length: n }, (_, i) => `g${i}`);
      const candidates = new Set(all);
      // 화면에 보이는 강(sizeOptions)에 엔진이 받는 나머지 2의 거듭제곱(2·8강)도 더해 본다
      const sizes = new Set([...sizeOptions(n).map((o) => o.size), ...[2, 8, nextPow2(n)].filter((s) => sizeEnabled(s, n))]);
      for (const size of sizes) {
        const bracket = drawBracket(all, size, rng);
        const entrants = Math.min(n, size);
        for (const third of [true, false]) {
          let s = startTournament("alltime", bracket, third);
          expect(s.thirdPlace).toBe(third && thirdPlaceAvailable(size, n));
          const total = totalMatches(s);
          expect(total).toBe(entrants - 1 + (s.thirdPlace ? 1 : 0));
          // replay 한 번으로 다음 판을 구하며 진행(pick을 매번 부르면 O(k²) replay가 두 번)
          const picks: string[] = [];
          for (;;) {
            const r = replay({ bracket, thirdPlace: s.thirdPlace, picks });
            if (!r.ok) throw new Error("replay 실패");
            const m = r.value.current;
            if (m === null) break;
            expect(m.pickIndex).toBe(picks.length);
            expect(m.a).not.toBe(m.b);
            picks.push(rng() < 0.5 ? m.a : m.b);
          }
          s = { ...s, picks };
          expect(picks.length).toBe(total);
          expect(isComplete(s)).toBe(true);
          const p = placements(s)!;
          const ids = p.map((x) => x.id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(p.filter((x) => x.rank === "champion")).toHaveLength(1);
          const t = tally(s);
          const sum = Object.values(t).reduce((acc, x) => ({ w: acc.w + x.wins, l: acc.l + x.losses }), { w: 0, l: 0 });
          expect(sum).toEqual({ w: total, l: total });
          expect(t[p[0].id].losses).toBe(0);
          // 결승까지 진 적 없는 게임은 우승자 하나뿐
          expect(Object.entries(t).filter(([, x]) => x.losses === 0).map(([id]) => id)).toEqual([p[0].id]);
          // 참가 게임은 모두 한 번 이상 판에 나온다(부전승만 하고 끝나는 게임은 없다)
          expect(Object.keys(t).length).toBe(entrants);
          const v = verifyRun(JSON.parse(JSON.stringify(s)), candidates);
          expect(v.ok && v.placements).toEqual(p);
          expect(v.ok && v.tally).toEqual(t);
        }
      }
    }
  }, 60_000);
});
