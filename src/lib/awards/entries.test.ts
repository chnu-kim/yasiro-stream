import { describe, expect, it } from "vitest";
import {
  AWARDS_YEAR,
  DEFAULT_THIRD_PLACE,
  defaultDivision,
  divisionAvailable,
  divisionEntries,
  DIVISION_LABEL,
  DIVISIONS,
  gameDivisions,
  gameInDivision,
  parseDivisionQuery,
  rankingsHref,
  toAwardEntries,
} from "./entries.ts";
import { fieldPhoto, highlightVod } from "../games/media.ts";
import { indexGames } from "../games/query.ts";
import type { Game, GameRecord, Vod } from "../games/types.ts";

const vod = (id: string, date: string, title: string): Vod => ({
  title,
  url: `https://www.youtube.com/watch?v=${id}`,
  date,
});

function g(id: string, firstPlayed: string | null, extra: Partial<Game> = {}): Game {
  return { id, name: `게임${id}`, firstPlayed, status: "clear", vods: [], ...extra };
}

describe("상수", () => {
  it("부문과 라벨", () => {
    expect(DIVISIONS).toEqual(["alltime", "2026"]);
    expect(AWARDS_YEAR).toBe("2026");
    expect(DIVISION_LABEL).toEqual({ alltime: "올타임 부문", "2026": "2026 부문" });
  });
});

describe("toAwardEntries", () => {
  it("번호는 /games indexGames와 같다(최신 먼저)", () => {
    const games = [g("b", "2025-01-01"), g("c", null), g("a", "2026-03-01")];
    const entries = toAwardEntries(games);
    expect(entries.map((e) => [e.id, e.no])).toEqual([
      ["a", "003"],
      ["b", "002"],
      ["c", "001"],
    ]);
    const indexed = new Map(indexGames(games).map((x) => [x.id, x]));
    for (const e of entries) {
      expect(e.ordinal).toBe(indexed.get(e.id)!.ordinal);
      expect(e.no).toBe(indexed.get(e.id)!.no);
    }
  });

  it("최소 필드만: categoryId·hidden·version·updatedByName이 새지 않는다", () => {
    const rec: GameRecord = {
      ...g("a", "2026-01-01", {
        originalTitle: "Original",
        posterUrl: "https://nng-phinf.pstatic.net/x.png",
        categoryId: "cat",
        status: "fail",
      }),
      hidden: false,
      version: 3,
      createdAt: 1,
      updatedAt: 2,
      updatedByName: "관리자",
    };
    const [e] = toAwardEntries([rec]);
    expect(Object.keys(e).sort()).toEqual(
      ["divisions", "firstPlayed", "id", "name", "no", "ordinal", "originalTitle", "posterUrl", "status", "vods"].sort(),
    );
    expect(e).toEqual({
      id: "a",
      name: "게임a",
      originalTitle: "Original",
      posterUrl: "https://nng-phinf.pstatic.net/x.png",
      firstPlayed: "2026-01-01",
      status: "fail",
      vods: [],
      ordinal: 1,
      no: "001",
      divisions: ["alltime", "2026"],
    });
  });

  it("관리자 보정 lastPlayed는 entry에 없고, 소속 계산에만 쓴다", () => {
    const [e] = toAwardEntries([g("a", "2024-01-01", { lastPlayed: "2026-12-19" })]);
    expect("lastPlayed" in e).toBe(false);
    expect(JSON.stringify(e)).not.toContain("2026-12-19");
    expect(e.divisions).toEqual(["alltime", "2026"]);
  });

  it("소속은 잘리기 전 전체 다시보기로 계산한다(현장 사진 편이 2025여도 2026 다시보기가 있으면 2026)", () => {
    const [e] = toAwardEntries([
      g("a", "2025-10-01", { vods: [vod("AAAAAAAAAAA", "2025-10-01", "게임a 했어요"), vod("BBBBBBBBBBB", "2026-02-01", "종겜룰렛데이 했어요")] }),
    ]);
    expect(e.vods.map((v) => v.date)).toEqual(["2025-10-01"]);
    expect(e.divisions).toEqual(["alltime", "2026"]);
  });

  it("originalTitle·posterUrl이 없으면 키도 없다", () => {
    const [e] = toAwardEntries([g("a", null)]);
    expect("originalTitle" in e).toBe(false);
    expect("posterUrl" in e).toBe(false);
  });

  it("vods는 namedYoutubeVod가 고른 한 편만, fieldPhoto는 원본과 같다", () => {
    const cases: Game[] = [
      // 여러 게임 방송 뒤의 단독 방송
      g("a", "2026-01-01", {
        vods: [
          vod("AAAAAAAAAAA", "2026-01-01", "다른 게임 하고 게임a 했어요"),
          vod("BBBBBBBBBBB", "2026-01-02", "게임a 했어요"),
          vod("CCCCCCCCCCC", "2026-01-03", "게임a 했어요 2"),
        ],
      }),
      // 이름 없는 방송만
      g("b", "2026-01-01", { vods: [vod("DDDDDDDDDDD", "2026-01-01", "종겜룰렛데이 했어요")] }),
      // 포스터가 있으면 사진은 없지만 vod는 남긴다
      g("c", "2026-01-01", {
        posterUrl: "https://nng-phinf.pstatic.net/x.png",
        vods: [vod("EEEEEEEEEEE", "2026-01-01", "게임c 했어요")],
      }),
      g("d", null),
    ];
    const entries = new Map(toAwardEntries(cases).map((e) => [e.id, e]));
    expect(entries.get("a")!.vods).toEqual([cases[0].vods[1]]);
    expect(entries.get("b")!.vods).toEqual([]);
    expect(entries.get("c")!.vods).toEqual([cases[2].vods[0]]);
    expect(entries.get("d")!.vods).toEqual([]);
    for (const game of cases) expect(fieldPhoto(entries.get(game.id)!)).toEqual(fieldPhoto(game));
  });
});

describe("toAwardEntries: 하이라이트 영상", () => {
  const hl = (v: Vod, h: number): Vod => ({ ...v, highlightStart: h });
  const cases: Game[] = [
    // named(B)와 하이라이트(D)가 다른 편: 날짜순으로 둘 다, 나머지는 빠진다
    g("a", "2026-01-01", {
      vods: [
        vod("AAAAAAAAAAA", "2026-01-01", "다른 게임 하고 게임a 했어요"),
        vod("BBBBBBBBBBB", "2026-01-02", "게임a 했어요"),
        vod("CCCCCCCCCCC", "2026-01-03", "게임a 했어요 2"),
        hl(vod("DDDDDDDDDDD", "2026-01-04", "종겜룰렛데이 했어요"), 600),
        hl(vod("EEEEEEEEEEE", "2026-01-05", "게임a 했어요 3"), 30),
      ],
    }),
    // 하이라이트가 named보다 앞: 순서 유지
    g("b", "2026-01-01", {
      vods: [hl(vod("FFFFFFFFFFF", "2026-01-01", "다른 게임 하고 게임b"), 0), vod("GGGGGGGGGGG", "2026-01-02", "게임b 했어요")],
    }),
    // 같은 편이면 하나만
    g("c", "2026-01-01", { vods: [vod("HHHHHHHHHHH", "2026-01-01", "저챗"), hl(vod("IIIIIIIIIII", "2026-01-02", "게임c 했어요"), 5)] }),
    // 하이라이트만(named 없음), 포스터 있음
    g("d", "2026-01-01", { posterUrl: "https://nng-phinf.pstatic.net/x.png", vods: [hl(vod("JJJJJJJJJJJ", "2026-01-01", "저챗"), 9)] }),
  ];
  const entries = new Map(toAwardEntries(cases).map((e) => [e.id, e]));
  it("vods = named 편과 하이라이트 편(날짜순, 같은 편이면 하나), 다른 편은 빠진다", () => {
    expect(entries.get("a")!.vods).toEqual([cases[0].vods[1], cases[0].vods[3]]);
    expect(entries.get("b")!.vods).toEqual([cases[1].vods[0], cases[1].vods[1]]);
    expect(entries.get("c")!.vods).toEqual([cases[2].vods[1]]);
    expect(entries.get("d")!.vods).toEqual([cases[3].vods[0]]);
    expect(entries.get("a")!.vods[1]).not.toBe(cases[0].vods[3]);
  });
  it("불변식: fieldPhoto·highlightVod가 원본과 같다", () => {
    for (const game of cases) {
      const e = entries.get(game.id)!;
      expect(fieldPhoto(e)).toEqual(fieldPhoto(game));
      expect(highlightVod(e)).toEqual(highlightVod(game));
    }
  });
});

describe("divisionEntries", () => {
  const entries = toAwardEntries([
    g("a", "2026-01-01"),
    g("b", "2026-12-31"),
    g("c", "2025-12-31"),
    g("d", null),
    g("e", "2026-06-15"),
  ]);

  it("alltime은 입력 그대로(같은 길이·순서, 새 배열)", () => {
    const out = divisionEntries(entries, "alltime");
    expect(out).toEqual(entries);
    expect(out).not.toBe(entries);
  });

  it("2026: 첫 플레이 2026(경계 포함)만, null·2025 제외, 번호는 전체 기준", () => {
    const out = divisionEntries(entries, "2026");
    expect(out.map((e) => e.id)).toEqual(["b", "e", "a"]);
    expect(out.map((e) => e.no)).toEqual(["005", "004", "003"]);
  });

  it("entry의 firstPlayed가 아니라 divisions만 본다", () => {
    const [a] = toAwardEntries([g("a", "2026-03-01")]);
    expect(divisionEntries([{ ...a, divisions: ["alltime"] }], "2026")).toEqual([]);
    expect(divisionEntries([{ ...a, firstPlayed: null, divisions: ["alltime", "2026"] }], "2026")).toHaveLength(1);
  });
});

describe("gameInDivision / gameDivisions", () => {
  it("alltime은 언제나 참(날짜가 없어도)", () => {
    for (const d of [null, "2025-12-31", "2026-01-01", "2027-01-01"]) expect(gameInDivision(g("x", d), "alltime")).toBe(true);
  });
  it("2026 = 2026년에 한 게임: 첫 플레이·다시보기·보정값 구간이 2026과 겹친다", () => {
    const cases: [Game, boolean][] = [
      [g("n", null), false],
      [g("p", "2025-12-31"), false],
      [g("q", "2026-01-01"), true],
      [g("s", "2026-12-31"), true],
      [g("r", "2027-01-01"), false],
      // 2025년에 처음 했지만 2026에도 한 게임(스펠렁키 2·리그 오브 레전드 유형)
      [g("lol", "2025-10-01", { vods: [vod("AAAAAAAAAAA", "2025-10-01", "t"), vod("BBBBBBBBBBB", "2026-02-01", "t")] }), true],
      [g("old", "2025-10-01", { vods: [vod("CCCCCCCCCCC", "2025-12-31", "t")] }), false],
      // 첫 플레이 기록이 없어도 2026 다시보기가 있으면 든다
      [g("nodate", null, { vods: [vod("DDDDDDDDDDD", "2026-04-04", "t")] }), true],
      [g("fix", "2024-01-01", { lastPlayed: "2026-01-01" }), true],
    ];
    for (const [game, want] of cases) {
      expect(gameInDivision(game, "2026"), game.id).toBe(want);
      expect(gameDivisions(game), game.id).toEqual(want ? ["alltime", "2026"] : ["alltime"]);
    }
  });
  it("첫 플레이가 2026이면 언제나 2026 부문(옛 규칙의 상위 집합이라 쌓인 집계가 빠지지 않는다)", () => {
    for (const d of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      expect(gameInDivision(g("x", d, { vods: [vod("AAAAAAAAAAA", "2027-01-01", "t")] }), "2026")).toBe(true);
    }
  });
});

describe("parseDivisionQuery / rankingsHref", () => {
  it("알려진 부문만, 그 밖은 2026", () => {
    expect(parseDivisionQuery("alltime")).toBe("alltime");
    expect(parseDivisionQuery("2026")).toBe("2026");
    for (const v of [undefined, "", "2025", "ALLTIME", ["alltime"], ["alltime", "2026"]]) expect(parseDivisionQuery(v), String(v)).toBe("2026");
  });
  it("순위 페이지 링크", () => {
    expect(rankingsHref("alltime")).toBe("/awards/rankings?division=alltime");
    expect(rankingsHref("2026")).toBe("/awards/rankings?division=2026");
  });
});

describe("divisionAvailable", () => {
  it("후보 3개 이상(가장 작은 4강)", () => {
    expect(divisionAvailable(0)).toBe(false);
    expect(divisionAvailable(2)).toBe(false);
    expect(divisionAvailable(3)).toBe(true);
  });
});

describe("기본 설정", () => {
  it("기본 부문은 2026, 2026 후보가 3개 미만이면 올타임", () => {
    expect(defaultDivision({ alltime: 338, "2026": 92 })).toBe("2026");
    expect(defaultDivision({ alltime: 338, "2026": 3 })).toBe("2026");
    expect(defaultDivision({ alltime: 338, "2026": 2 })).toBe("alltime");
    expect(defaultDivision({ alltime: 0, "2026": 0 })).toBe("alltime");
  });
  it("3·4위전은 기본 꺼짐", () => {
    expect(DEFAULT_THIRD_PLACE).toBe(false);
  });
});
