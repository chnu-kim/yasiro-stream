import { describe, expect, it } from "vitest";
import {
  applyFilterChange,
  countStats,
  detailQuery,
  DEFAULT_QUERY_STATE,
  filterGames,
  formatDate,
  indexGames,
  indexWithHidden,
  selectGames,
  sortDate,
  sortGames,
  statusCounts,
  parseDetailId,
  parseQueryState,
  serializeQueryState,
  matchesQuery,
  normalize,
  normalizeQ,
  parseSortKey,
  parseYearFilter,
  Q_MAX,
  SORT_KEYS,
  STATUS_FILTERS,
  toInitials,
} from "./query.ts";
import type { Game, GamesQueryState, GameStatus } from "./types.ts";

function g(
  id: string,
  name: string,
  firstPlayed: string | null,
  status: GameStatus,
  originalTitle?: string,
): Game {
  return {
    id,
    name,
    ...(originalTitle ? { originalTitle } : {}),
    firstPlayed,
    status,
    vods: [],
  };
}

// 디자인 데이터 일부 (입력 순서는 의도적으로 섞음)
const fixture: Game[] = [
  g("sb", "스텔라 블레이드", "2026-10-21", "unknown", "Stellar Blade"),
  g("ring", "링 피트 어드벤처", null, "unknown"),
  g("pp", "패들 패들 패들", "2025-10-08", "fail", "paddle paddle paddle"),
  g("po", "파멸의 오타쿠", "2026-10-23", "unknown"),
  g("bear", "곰아저씨 레스토랑", "2025-10-02", "clear", "Bear's Restaurant"),
  g("sixty", "60 Parsecs!", null, "unknown"),
  g("gal", "걸☆건 2", "2025-09-27", "clear", "Gal*Gun 2"),
  g("sh", "사일런트 힐 f", "2025-09-23", "clear", "SILENT HILL f"),
  g("ting", "There Is No Game: Wrong Dimension", "2025-07-31", "clear"),
];
const ids = (xs: readonly Game[]) => xs.map((x) => x.id);


const stellar = { name: "스텔라 블레이드", originalTitle: "Stellar Blade" };
const bear = { name: "곰아저씨 레스토랑", originalTitle: "Bear's Restaurant" };
const galgun = { name: "걸☆건 2", originalTitle: "Gal*Gun 2" };

describe("normalize", () => {
  it("기호·공백을 제거하고 소문자로 만든다", () => {
    expect(normalize("Gal*Gun 2")).toBe("galgun2");
    expect(normalize("걸☆건 2")).toBe("걸건2");
    expect(normalize("No, I'm not a Human")).toBe("noimnotahuman");
  });
});

describe("toInitials", () => {
  it("음절을 초성으로 바꾸고 나머지는 유지한다", () => {
    expect(toInitials("스텔라블레이드")).toBe("ㅅㅌㄹㅂㄹㅇㄷ");
    expect(toInitials("ab가")).toBe("abㄱ");
  });
  it("음절 범위 경계: U+AC00(가)·U+D7A3(힣)은 변환, 바로 바깥 U+ABFF·U+D7A4는 그대로", () => {
    expect(toInitials("\uAC00")).toBe("ㄱ");
    expect(toInitials("\uD7A3")).toBe("ㅎ");
    expect(toInitials("\uABFF")).toBe("\uABFF");
    expect(toInitials("\uD7A4")).toBe("\uD7A4");
    expect(toInitials("\uABFF가\uD7A4힣")).toBe("\uABFFㄱ\uD7A4ㅎ");
  });
  it("각 초성 블록의 첫·끝 음절이 같은 초성으로 간다 (588자 단위)", () => {
    expect(toInitials(String.fromCodePoint(0xac00 + 587))).toBe("ㄱ");
    expect(toInitials(String.fromCodePoint(0xac00 + 588))).toBe("ㄲ");
    expect(toInitials(String.fromCodePoint(0xd7a3 - 587))).toBe("ㅎ");
    expect(toInitials(String.fromCodePoint(0xd7a3 - 588))).toBe("ㅍ");
  });
});

describe("normalize 엣지", () => {
  it("NFD 입력을 NFC로 합친다", () => {
    expect(normalize("스텔라".normalize("NFD"))).toBe("스텔라");
  });
  it("이모지와 공백은 제거하고 가나·악센트는 남긴다", () => {
    expect(normalize("🎮 스텔라")).toBe("스텔라");
    expect(normalize("ゼルダの伝説")).toBe("ゼルダの伝説");
    expect(normalize("Pokémon")).toBe("pokémon");
  });
  it("호환 자모는 NFKC 변환 없이 유지된다", () => {
    expect(normalize("ㄱ")).toBe("ㄱ");
  });
  it("기호뿐이면 빈 문자열", () => {
    expect(normalize("☆*!")).toBe("");
  });
});

describe("matchesQuery", () => {
  it("이름 전체·부분 문자열로 찾는다", () => {
    expect(matchesQuery(stellar, "스텔라")).toBe(true);
    expect(matchesQuery(stellar, "블레")).toBe(true);
  });
  it("원제로 찾고 대소문자를 무시한다", () => {
    expect(matchesQuery(stellar, "stellar")).toBe(true);
    expect(matchesQuery(stellar, "STELLAR BLADE")).toBe(true);
  });
  it("초성으로 찾는다", () => {
    expect(matchesQuery(stellar, "ㅅㅌㄹ")).toBe(true);
    expect(matchesQuery(bear, "ㄱㅇㅈㅆ")).toBe(true);
  });
  it("공백·기호를 무시한다", () => {
    for (const q of ["걸건", "걸 건", "gal gun", "galgun2"]) {
      expect(matchesQuery(galgun, q)).toBe(true);
    }
    expect(matchesQuery(bear, "bears")).toBe(true);
  });
  it("정규화 후 빈 질의는 항상 일치", () => {
    for (const q of ["", "   ", "☆*!"]) {
      expect(matchesQuery(stellar, q)).toBe(true);
    }
  });
  it("원제가 없으면 이름만 비교한다", () => {
    expect(matchesQuery({ name: "컵헤드" }, "cuphead")).toBe(false);
    expect(matchesQuery({ name: "컵헤드" }, "컵헤드")).toBe(true);
  });
  it("정규화 후 빈 대상은 불일치로 본다", () => {
    expect(matchesQuery({ name: "☆☆" }, "a")).toBe(false);
    expect(matchesQuery({ name: "☆☆", originalTitle: "!!" }, "ㄱ")).toBe(false);
  });
  it("NFD 질의도 일치한다", () => {
    expect(matchesQuery(stellar, "스텔라".normalize("NFD"))).toBe(true);
  });
  it("호환 자모 ㄱ(U+3131) 질의가 초성 매칭된다 (NFKC 회귀)", () => {
    expect(matchesQuery({ name: "가나" }, "\u3131")).toBe(true);
  });
  it("가나·악센트 원제", () => {
    expect(matchesQuery({ name: "젤다", originalTitle: "ゼルダの伝説" }, "ゼルダ")).toBe(true);
    expect(matchesQuery({ name: "포켓몬", originalTitle: "Pokémon" }, "pokémon")).toBe(true);
    expect(matchesQuery({ name: "포켓몬", originalTitle: "Pokémon" }, "POKÉMON")).toBe(true);
  });
  it("이모지 섞인 질의", () => {
    expect(matchesQuery(stellar, "🎮 스텔라")).toBe(true);
  });
  it("초성과 완성자 혼합 질의는 지원하지 않는다", () => {
    expect(matchesQuery(stellar, "스ㅌ")).toBe(false);
  });
  it("정규식 메타문자도 예외 없이 처리한다", () => {
    for (const q of [".*", "(", "["]) {
      expect(() => matchesQuery(stellar, q)).not.toThrow();
    }
    // 정규식으로 해석되지 않는다: "a.*b"는 "ab"로 정규화되어 "axb"와 불일치
    expect(matchesQuery({ name: "axb" }, "a.*b")).toBe(false);
  });
  it("매우 긴 질의는 false", () => {
    expect(matchesQuery(stellar, "가".repeat(10000))).toBe(false);
  });
});

describe("filterGames", () => {
  const all = { q: "", status: "all", year: "all" } as const;
  it("조건이 없으면 입력 순서 그대로", () => {
    expect(ids(filterGames(fixture, all))).toEqual(ids(fixture));
  });
  it("status clear는 4건이고 입력 순서를 유지한다", () => {
    expect(ids(filterGames(fixture, { ...all, status: "clear" }))).toEqual(["bear", "gal", "sh", "ting"]);
  });
  it("year 2026은 2건, none은 날짜 없는 2건", () => {
    expect(ids(filterGames(fixture, { ...all, year: "2026" }))).toEqual(["sb", "po"]);
    expect(ids(filterGames(fixture, { ...all, year: "none" }))).toEqual(["ring", "sixty"]);
  });
  it("status·year·q를 AND로 결합한다", () => {
    expect(ids(filterGames(fixture, { q: "ㅅㅇㄹㅌ", status: "clear", year: "2025" }))).toEqual(["sh"]);
  });
  it("데이터에 없는 연도는 빈 배열", () => {
    expect(filterGames(fixture, { ...all, year: "2024" })).toEqual([]);
    expect(filterGames(fixture, { q: "", status: "clear", year: "1999" })).toEqual([]);
  });
  it("검색은 날짜 없는 게임도 포함한다", () => {
    expect(ids(filterGames(fixture, { ...all, q: "parsecs" }))).toEqual(["sixty"]);
  });
  it("입력 배열을 변경하지 않는다", () => {
    const copy = [...fixture];
    filterGames(fixture, { ...all, status: "clear" });
    expect(fixture).toEqual(copy);
    fixture.forEach((x, i) => expect(x).toBe(copy[i]));
  });
});

describe("parseQueryState", () => {
  it("URLSearchParams를 그대로 읽는다", () => {
    expect(
      parseQueryState(new URLSearchParams("q=스텔라&status=clear&year=2025&sort=old&view=diary")),
    ).toEqual({ q: "스텔라", status: "clear", year: "2025", sort: "old", view: "diary" });
  });
  it("Record 입력은 빠진 값을 기본값으로 채운다", () => {
    expect(parseQueryState({ q: "a", status: "fail" })).toEqual({
      q: "a", status: "fail", year: "all", sort: "recent", view: "grid",
    });
  });
  it("빈 입력은 기본값", () => {
    expect(parseQueryState({})).toEqual(DEFAULT_QUERY_STATE);
    expect(parseQueryState(new URLSearchParams())).toEqual(DEFAULT_QUERY_STATE);
    expect(parseQueryState({ q: undefined, view: undefined })).toEqual(DEFAULT_QUERY_STATE);
  });
  it("배열 값은 첫 원소, 빈 배열은 기본값", () => {
    expect(parseQueryState({ status: ["fail", "clear"] }).status).toBe("fail");
    expect(parseQueryState({ status: [] }).status).toBe("all");
    expect(parseQueryState({ q: ["", "x"] }).q).toBe("");
  });
  it("잘못된 status는 all (대소문자 구분)", () => {
    for (const v of ["CLEAR", "cleared", ""]) expect(parseQueryState({ status: v }).status).toBe("all");
  });
  it("year는 all|none|YYYY만 허용, 없는 연도도 유지", () => {
    for (const v of ["25", "20255", "abcd", "None", ""]) expect(parseQueryState({ year: v }).year).toBe("all");
    expect(parseQueryState({ year: "none" }).year).toBe("none");
    expect(parseQueryState({ year: "2024" }).year).toBe("2024");
  });
  it("잘못된 sort는 recent", () => {
    for (const v of ["newest", "RECENT", ""]) expect(parseQueryState({ sort: v }).sort).toBe("recent");
    expect(parseQueryState({ sort: "name" }).sort).toBe("name");
  });
  it("view는 grid|diary만 허용, 나머지는 grid", () => {
    for (const v of ["DIARY", "list", ""]) expect(parseQueryState({ view: v }).view).toBe("grid");
    expect(parseQueryState({ view: "diary" }).view).toBe("diary");
  });
  it("예전 공유 링크의 page는 무시한다(연도 챕터로 바뀌어 페이지가 없다)", () => {
    expect(parseQueryState({ page: "3" })).toEqual(DEFAULT_QUERY_STATE);
    expect(serializeQueryState(parseQueryState(new URLSearchParams("status=clear&page=2")))).toBe("status=clear");
  });
  it("q는 trim하고 100자로 자른다", () => {
    expect(parseQueryState({ q: "  스텔라  " }).q).toBe("스텔라");
    expect(parseQueryState({ q: "a".repeat(101) }).q).toHaveLength(100);
  });
  it("알 수 없는 키는 무시한다", () => {
    expect(parseQueryState({ foo: "bar", game: "x" })).toEqual(DEFAULT_QUERY_STATE);
  });
});

describe("serializeQueryState", () => {
  it("기본 상태는 빈 문자열", () => {
    expect(serializeQueryState(DEFAULT_QUERY_STATE)).toBe("");
  });
  it("기본값과 다른 키만, 정해진 순서로", () => {
    expect(serializeQueryState({ ...DEFAULT_QUERY_STATE, view: "diary", status: "clear" })).toBe("status=clear&view=diary");
    expect(serializeQueryState({ ...DEFAULT_QUERY_STATE, status: "fail" })).toBe("status=fail");
    expect(serializeQueryState({ q: "a", status: "clear", year: "none", sort: "name", view: "diary" })).toBe(
      "q=a&status=clear&year=none&sort=name&view=diary",
    );
  });
  it("공백뿐인 q는 생략", () => {
    expect(serializeQueryState({ ...DEFAULT_QUERY_STATE, q: "  " })).toBe("");
  });
  it("한글은 퍼센트 인코딩된다", () => {
    expect(serializeQueryState({ ...DEFAULT_QUERY_STATE, q: "스텔라" })).toBe("q=%EC%8A%A4%ED%85%94%EB%9D%BC");
  });
  it("왕복: parse(serialize(s)) === s", () => {
    const states: GamesQueryState[] = [
      DEFAULT_QUERY_STATE,
      { q: "스텔라 블레이드", status: "clear", year: "2025", sort: "old", view: "diary" },
      { q: "a&b=c?", status: "fail", year: "none", sort: "name", view: "grid" },
      { q: "", status: "unknown", year: "2024", sort: "recent", view: "diary" },
    ];
    for (const s of states) {
      expect(parseQueryState(new URLSearchParams(serializeQueryState(s)))).toEqual(s);
    }
  });
});

describe("applyFilterChange", () => {
  const s: GamesQueryState = { ...DEFAULT_QUERY_STATE, view: "diary" };
  it("바꾼 값만 덮어쓰고 나머지(보기 포함)는 유지한다", () => {
    expect(applyFilterChange(s, { status: "fail" })).toEqual({ ...s, status: "fail" });
    expect(applyFilterChange(s, { q: "x", sort: "name" })).toEqual({ ...s, q: "x", sort: "name" });
    expect(applyFilterChange(s, { view: "grid" }).view).toBe("grid");
  });
  it("입력 상태를 변경하지 않는다", () => {
    const before = { ...s };
    applyFilterChange(s, { status: "clear" });
    expect(s).toEqual(before);
  });
});

describe("countStats", () => {
  it("endless를 따로 센다", () => {
    const gs: Game[] = [
      { id: "lol", name: "리그 오브 레전드", firstPlayed: null, status: "endless", vods: [] },
      { id: "tft", name: "전략적 팀 전투", firstPlayed: "2024-01-01", status: "endless", vods: [] },
      { id: "a", name: "a", firstPlayed: "2024-01-01", status: "clear", vods: [] },
    ];
    expect(countStats(gs)).toEqual({ total: 3, clear: 1, fail: 0, endless: 2, unknown: 0, undated: 1 });
  });

  it("집계한다", () => {
    expect(countStats(fixture)).toEqual({ total: 9, clear: 4, fail: 1, endless: 0, unknown: 4, undated: 2 });
  });
  it("빈 목록은 전부 0", () => {
    expect(countStats([])).toEqual({ total: 0, clear: 0, fail: 0, endless: 0, unknown: 0, undated: 0 });
  });
});

describe("formatDate", () => {
  it("점 표기로 바꾼다", () => {
    expect(formatDate("2025-09-23")).toBe("2025.09.23");
  });
  it("null은 날짜 기록 없음", () => {
    expect(formatDate(null)).toBe("날짜 기록 없음");
  });
});

describe("sortGames", () => {
  it("recent: 최신순, 날짜 없음은 맨 뒤(이름순)", () => {
    expect(ids(sortGames(fixture, "recent"))).toEqual([
      "po", "sb", "pp", "bear", "gal", "sh", "ting", "sixty", "ring",
    ]);
  });
  it("old: 오래된 순이고 날짜 없음은 여전히 맨 뒤", () => {
    expect(ids(sortGames(fixture, "old"))).toEqual([
      "ting", "sh", "gal", "bear", "pp", "sb", "po", "sixty", "ring",
    ]);
  });
  it("name: ko collator 순서(숫자, 한글, 라틴)", () => {
    const sorted = sortGames(fixture, "name");
    expect(ids(sorted)).toEqual(["sixty", "gal", "bear", "ring", "sh", "sb", "po", "pp", "ting"]);
    const collator = new Intl.Collator("ko", { numeric: true });
    const names = fixture.map((x) => x.name).sort(collator.compare);
    expect(sorted.map((x) => x.name)).toEqual(names);
  });
  it("같은 날짜면 numeric 이름순: 게임 2가 게임 10보다 앞", () => {
    const tie = [g("a", "게임 10", "2025-01-01", "clear"), g("b", "게임 2", "2025-01-01", "clear")];
    expect(ids(sortGames(tie, "recent"))).toEqual(["b", "a"]);
    expect(ids(sortGames(tie, "old"))).toEqual(["b", "a"]);
    expect(ids(sortGames(tie, "name"))).toEqual(["b", "a"]);
  });
  it("played: 마지막 플레이 최신순(없으면 첫 플레이), 같으면 첫 플레이 최신순, 날짜 없음은 맨 뒤", () => {
    const list: Game[] = [
      g("new", "새 게임", "2026-11-20", "clear"),
      { ...g("old-back", "옛 게임", "2024-06-21", "fail"), lastPlayed: "2026-11-23" },
      { ...g("lol", "롤", "2025-12-17", "endless"), lastPlayed: "2026-11-20" },
      g("mid", "중간", "2025-05-01", "clear"),
      { ...g("lp-only", "마지막만", null, "unknown"), lastPlayed: "2025-07-01" },
      g("none", "날짜 없음", null, "unknown"),
    ];
    expect(ids(sortGames(list, "played"))).toEqual(["old-back", "new", "lol", "lp-only", "mid", "none"]);
    expect(ids(sortGames([...list].reverse(), "played"))).toEqual(["old-back", "new", "lol", "lp-only", "mid", "none"]);
  });
  it("sortDate: played면 마지막 플레이(없으면 첫 플레이), 나머지는 첫 플레이", () => {
    const back = { ...g("x", "x", "2024-06-21", "fail"), lastPlayed: "2026-11-23" };
    expect(sortDate(back, "played")).toBe("2026-11-23");
    expect(sortDate(back, "recent")).toBe("2024-06-21");
    expect(sortDate(back, "old")).toBe("2024-06-21");
    expect(sortDate(back, "name")).toBe("2024-06-21");
    expect(sortDate(g("y", "y", "2025-01-01", "clear"), "played")).toBe("2025-01-01");
    expect(sortDate(g("z", "z", null, "clear"), "played")).toBeNull();
  });
  it("날짜와 이름이 같으면 id 순", () => {
    const tie = ["m", "z", "a", "q"].map((id) => g(id, "같음", "2025-01-01", "clear"));
    for (const key of ["recent", "old", "name", "played"] as const) {
      expect(ids(sortGames(tie, key))).toEqual(["a", "m", "q", "z"]);
      expect(ids(sortGames([...tie].reverse(), key))).toEqual(["a", "m", "q", "z"]);
    }
  });
  it("id 동률 해소는 UTF-16이 아니라 코드포인트 순 (모든 정렬 키에서 같다)", () => {
    // U+FFB1(BMP) < U+20000(astral)이 코드포인트 순. UTF-16 비교라면 서로게이트 0xD840이 0xFFB1보다 작아 뒤집힌다.
    const tie = [g("\u{20000}", "같음", "2025-01-01", "clear"), g("\uFFB1", "같음", "2025-01-01", "clear")];
    for (const key of ["recent", "old", "name"] as const) {
      expect(ids(sortGames(tie, key)), key).toEqual(["\uFFB1", "\u{20000}"]);
    }
  });
  it("name·old: 이름·id가 모두 같으면 입력 순서를 유지한다(stable)", () => {
    const dup = [
      { ...g("same", "같음", "2025-01-01", "clear"), vods: [{ title: "첫째", url: "u1", date: "2025-01-02" }] },
      { ...g("same", "같음", "2025-01-01", "clear"), vods: [{ title: "둘째", url: "u2", date: "2025-01-03" }] },
    ];
    for (const key of ["old", "name"] as const) {
      expect(sortGames(dup, key).map((x) => x.vods[0].title)).toEqual(["첫째", "둘째"]);
    }
  });
  it("old에서 날짜 없는 게임끼리도 이름순", () => {
    const undated = [g("b", "나", null, "clear"), g("a", "가", null, "clear")];
    expect(ids(sortGames(undated, "old"))).toEqual(["a", "b"]);
  });
  it("name 정렬은 날짜와 무관", () => {
    const mixed = [g("n", "나", null, "clear"), g("d", "다", "2026-01-01", "clear"), g("g", "가", "2020-01-01", "clear")];
    expect(ids(sortGames(mixed, "name"))).toEqual(["g", "n", "d"]);
  });
  it("사본을 반환하고 입력을 변경하지 않는다", () => {
    const copy = [...fixture];
    const out = sortGames(fixture, "name");
    expect(out).not.toBe(fixture);
    fixture.forEach((x, i) => expect(x).toBe(copy[i]));
  });
  it("빈 배열", () => {
    expect(sortGames([], "old")).toEqual([]);
  });
});

describe("indexGames", () => {
  it("canonical 순서로 번호를 부여한다(최신이 가장 큼, 날짜 없음이 가장 작음)", () => {
    const out = indexGames(fixture);
    expect(ids(out)).toEqual(["po", "sb", "pp", "bear", "gal", "sh", "ting", "sixty", "ring"]);
    expect(out[0]).toMatchObject({ ordinal: 9, no: "009" });
    expect(out[8]).toMatchObject({ ordinal: 1, no: "001" });
  });
  it("원본 필드를 보존한다", () => {
    expect(indexGames([fixture[0]])[0]).toMatchObject(fixture[0]);
  });
  it("빈 배열", () => {
    expect(indexGames([])).toEqual([]);
  });
  it("1000건이면 패딩 없이 1000", () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      g(`g${String(i).padStart(4, "0")}`, `게임${i}`, null, "unknown"),
    );
    const out = indexGames(many);
    expect(out[0].no).toBe("1000");
    expect(out[999].no).toBe("001");
  });
  it("입력 배열을 변경하지 않는다", () => {
    const copy = [...fixture];
    indexGames(fixture);
    fixture.forEach((x, i) => expect(x).toBe(copy[i]));
  });
  it("필터·정렬과 무관하게 번호가 고정된다", () => {
    const indexed = indexGames(fixture);
    const sb = indexed.find((x) => x.id === "sb")!;
    const filtered = filterGames(indexed, { q: "", status: "unknown", year: "2026" });
    expect(filtered.find((x) => x.id === "sb")!.no).toBe(sb.no);
  });
});

describe("selectGames", () => {
  const many = indexGames(
    Array.from({ length: 30 }, (_, i) => g(`g${i}`, `게임${i}`, `2025-01-${String(i + 1).padStart(2, "0")}`, i % 3 === 0 ? "fail" : "clear")),
  );
  it("필터 → 정렬 순으로 적용하고 나누지 않는다(전부 돌려준다)", () => {
    const out = selectGames(many, { ...DEFAULT_QUERY_STATE, sort: "old" });
    expect(out).toHaveLength(30);
    expect(out.slice(0, 2).map((x) => x.id)).toEqual(["g0", "g1"]);
    expect(selectGames(many, { ...DEFAULT_QUERY_STATE, status: "fail" })).toHaveLength(10);
  });
  it("결과 0건은 빈 배열", () => {
    expect(selectGames(many, { ...DEFAULT_QUERY_STATE, q: "없는게임" })).toEqual([]);
  });
});

describe("statusCounts", () => {
  const gs: Game[] = [
    g("a", "가", "2026-01-01", "clear"),
    g("b", "나", "2026-02-01", "fail"),
    g("c", "다", "2025-01-01", "clear"),
    g("d", "라", null, "endless"),
  ];
  it("상태 버튼마다 그 상태를 골랐을 때의 개수(검색·연도는 반영, 지금 고른 상태는 무시)", () => {
    expect(statusCounts(gs, DEFAULT_QUERY_STATE)).toEqual({ all: 4, clear: 2, fail: 1, endless: 1, unknown: 0 });
    expect(statusCounts(gs, { ...DEFAULT_QUERY_STATE, status: "fail", year: "2026" })).toEqual({
      all: 2, clear: 1, fail: 1, endless: 0, unknown: 0,
    });
    expect(statusCounts(gs, { ...DEFAULT_QUERY_STATE, q: "다" }).all).toBe(1);
  });
});

describe("normalizeQ", () => {
  it("trim하고 Q_MAX(100)자로 자른다", () => {
    expect(Q_MAX).toBe(100);
    expect(normalizeQ("  스텔라  ")).toBe("스텔라");
    expect(normalizeQ("a".repeat(101))).toBe("a".repeat(100));
    expect(normalizeQ("")).toBe("");
    expect(normalizeQ("   ")).toBe("");
  });
  it("자른 끝에 남은 공백도 지운다 (멱등)", () => {
    const raw = "a".repeat(99) + " b";
    expect(normalizeQ(raw)).toBe("a".repeat(99));
    expect(normalizeQ(normalizeQ(raw))).toBe(normalizeQ(raw));
  });
  it("서로게이트 쌍 중간에서 자르지 않는다", () => {
    const raw = "a".repeat(99) + "😀";
    expect(normalizeQ(raw)).toBe("a".repeat(99));
    expect(normalizeQ("a".repeat(98) + "😀")).toBe("a".repeat(98) + "😀");
  });
  it("parseQueryState의 q와 같은 규칙", () => {
    for (const raw of ["  x ", "a".repeat(99) + " b", "a".repeat(99) + "😀", "가".repeat(150)]) {
      expect(parseQueryState({ q: raw }).q, raw).toBe(normalizeQ(raw));
    }
  });
});

describe("STATUS_FILTERS / SORT_KEYS", () => {
  it("UI 노출 순서 그대로", () => {
    expect(STATUS_FILTERS).toEqual(["all", "clear", "fail", "endless", "unknown"]);
    expect(SORT_KEYS).toEqual(["recent", "played", "old", "name"]);
  });
});

describe("parseYearFilter / parseSortKey", () => {
  it("year: all|none|YYYY, 나머지는 all", () => {
    expect(parseYearFilter("none")).toBe("none");
    expect(parseYearFilter("all")).toBe("all");
    expect(parseYearFilter("2024")).toBe("2024");
    for (const v of [undefined, "", "25", "20255", "None", " 2024", "2024 "]) expect(parseYearFilter(v), String(v)).toBe("all");
  });
  it("sort: recent|old|name, 나머지는 recent", () => {
    expect(parseSortKey("old")).toBe("old");
    expect(parseSortKey("name")).toBe("name");
    expect(parseSortKey("played")).toBe("played");
    for (const v of [undefined, "", "RECENT", "newest"]) expect(parseSortKey(v), String(v)).toBe("recent");
  });
});

describe("parseDetailId", () => {
  it("유효한 game 파라미터를 돌려준다", () => {
    expect(parseDetailId(new URLSearchParams("game=silent-hill-f"))).toBe("silent-hill-f");
    expect(parseDetailId({ game: "스텔라-블레이드" })).toBe("스텔라-블레이드");
  });
  it("배열이면 첫 값을 쓴다", () => {
    expect(parseDetailId({ game: ["cuphead", "x"] })).toBe("cuphead");
  });
  it("없거나 빈 값이면 null", () => {
    expect(parseDetailId(new URLSearchParams(""))).toBeNull();
    expect(parseDetailId({ game: "" })).toBeNull();
    expect(parseDetailId({ game: undefined })).toBeNull();
    expect(parseDetailId({ game: [] })).toBeNull();
  });
  it("ID 형식이 아니면 null (대문자·공백·앞뒤 하이픈·연속 하이픈·특수문자)", () => {
    for (const bad of ["Cuphead", "cup head", "-cuphead", "cuphead-", "cup--head", "cup/head", "<script>"]) {
      expect(parseDetailId({ game: bad })).toBeNull();
    }
  });
});

describe("detailQuery", () => {
  it("목록 상태를 유지하고 game을 붙인다", () => {
    const state = { ...DEFAULT_QUERY_STATE, q: "힐", status: "clear" as const, view: "diary" as const };
    const qs = new URLSearchParams(detailQuery(state, "silent-hill-f"));
    expect(qs.get("game")).toBe("silent-hill-f");
    expect(parseQueryState(qs)).toEqual(state);
  });
  it("기본 상태면 game만 남는다", () => {
    expect(detailQuery(DEFAULT_QUERY_STATE, "cuphead")).toBe("game=cuphead");
  });
  it("null이면 game 없이 목록 상태만 직렬화한다", () => {
    const state = { ...DEFAULT_QUERY_STATE, sort: "name" as const };
    expect(detailQuery(state, null)).toBe(serializeQueryState(state));
    expect(detailQuery(DEFAULT_QUERY_STATE, null)).toBe("");
  });
  it("한글 ID는 인코딩되고 왕복된다", () => {
    const qs = detailQuery(DEFAULT_QUERY_STATE, "스텔라-블레이드");
    expect(qs).not.toContain("스");
    expect(parseDetailId(new URLSearchParams(qs))).toBe("스텔라-블레이드");
  });
  it("입력 상태를 변경하지 않는다", () => {
    const state = Object.freeze({ ...DEFAULT_QUERY_STATE, q: "a" });
    detailQuery(state, "cuphead");
    expect(state.q).toBe("a");
  });
  it("serializeQueryState는 game을 넣지 않는다(필터·보기 변경 시 상세가 닫힌다)", () => {
    expect(serializeQueryState(parseQueryState(new URLSearchParams("game=cuphead&view=diary")))).toBe("view=diary");
  });
});

describe("endless 상태 필터", () => {
  it("status=endless를 파싱·직렬화하고 그 게임만 거른다", () => {
    const st = parseQueryState(new URLSearchParams("status=endless"));
    expect(st.status).toBe("endless");
    expect(serializeQueryState(st)).toBe("status=endless");
    const gs = indexGames([
      { id: "lol", name: "리그 오브 레전드", firstPlayed: null, status: "endless", vods: [] },
      { id: "a", name: "a", firstPlayed: null, status: "fail", vods: [] },
    ]);
    expect(filterGames(gs, st).map((g) => g.id)).toEqual(["lol"]);
  });
});

describe("indexWithHidden", () => {
  const withHidden = (hiddenIds: string[]) => fixture.map((x) => ({ ...x, hidden: hiddenIds.includes(x.id) }));
  it("숨김이 없으면 indexGames와 같은 번호", () => {
    const all = indexWithHidden(withHidden([]));
    const expected = new Map(indexGames(fixture).map((x) => [x.id, x]));
    for (const x of all) {
      expect(x.ordinal).toBe(expected.get(x.id)?.ordinal);
      expect(x.no).toBe(expected.get(x.id)?.no);
    }
  });
  it("숨긴 게임은 0과 —", () => {
    const sb = indexWithHidden(withHidden(["sb"])).find((x) => x.id === "sb");
    expect(sb).toMatchObject({ ordinal: 0, no: "—", hidden: true });
  });
  it("보이는 게임 번호는 숨김 때문에 밀리지 않는다", () => {
    const hiddenOne = indexWithHidden(withHidden(["po"]));
    const visibleOnly = new Map(indexGames(fixture.filter((x) => x.id !== "po")).map((x) => [x.id, x.ordinal]));
    for (const x of hiddenOne.filter((y) => !y.hidden)) expect(x.ordinal).toBe(visibleOnly.get(x.id));
    expect(Math.max(...hiddenOne.map((x) => x.ordinal))).toBe(fixture.length - 1);
  });
  it("입력 순서를 유지한다", () => {
    expect(indexWithHidden(withHidden(["sb"])).map((x) => x.id)).toEqual(fixture.map((x) => x.id));
  });
});
