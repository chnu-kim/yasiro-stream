import { describe, expect, it } from "vitest";
import {
  applyFix,
  changedFields,
  changedLabels,
  draftKey,
  DRAFT_KEY_PREFIX,
  fieldDomId,
  formPosterUrl,
  formToInput,
  formToPatch,
  formToRaw,
  gameToForm,
  issuesHeadline,
  issuesToFormIssues,
  normalizeHighlight,
  parseDraft,
  serializeDraft,
  unlinkKeepsPoster,
  effectiveLastPlayed,
  raiseLastPlayed,
  lastPlayedHint,
  suggestFirstPlayed,
  validateForm,
} from "./patch.ts";
import { CHZZK_VOD_MESSAGE } from "./schema.ts";
import type { Game, GameForm } from "./types.ts";

const POSTER = "https://ssl.pstatic.net/static/nng/glive/category/a.png";
const V1 = { title: "첫 번째", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", date: "2026-10-10" };
const V2 = { title: "두 번째", url: "https://youtu.be/bbbbbbbbbbb", date: "2026-10-15" };
/** 폼 다시보기 행(하이라이트 원문 "") */
const F1 = { ...V1, highlight: "" };
const F2 = { ...V2, highlight: "" };

const base: Game = {
  id: "stellar-blade",
  name: "스텔라 블레이드",
  originalTitle: "Stellar Blade",
  categoryId: "Stellar_Blade",
  posterUrl: POSTER,
  firstPlayed: "2026-10-10",
  status: "unknown",
  vods: [V1, V2],
};

const other: Game = { id: "other", name: "다른 게임", categoryId: "Other_Cat", firstPlayed: null, status: "clear", vods: [] };

function form(over: Partial<GameForm> = {}): GameForm {
  return { ...gameToForm(base), ...over };
}

describe("gameToForm", () => {
  it("null은 빈 폼", () => {
    expect(gameToForm(null)).toEqual({ name: "", originalTitle: "", category: null, firstPlayed: "", undated: false, lastPlayed: "", status: "unknown", vods: [] });
  });
  it("전체 필드", () => {
    expect(gameToForm(base)).toEqual({
      name: "스텔라 블레이드",
      originalTitle: "Stellar Blade",
      category: { categoryId: "Stellar_Blade", posterUrl: POSTER },
      firstPlayed: "2026-10-10",
      undated: false,
      lastPlayed: "",
      status: "unknown",
      vods: [F1, F2],
    });
  });
  it("카테고리만 있고 포스터 없음 / 날짜 없음", () => {
    const f = gameToForm({ id: "x", name: "x", categoryId: "C", firstPlayed: null, status: "fail", vods: [] });
    expect(f.category).toEqual({ categoryId: "C", posterUrl: null });
    expect(f.undated).toBe(true);
    expect(f.firstPlayed).toBe("");
    expect(gameToForm({ id: "x", name: "x", firstPlayed: null, status: "fail", vods: [] }).category).toBeNull();
    expect(gameToForm(other).category).toEqual({ categoryId: "Other_Cat", posterUrl: null });
  });
  it("vods는 복사본", () => {
    const f = gameToForm(base);
    expect(f.vods[0]).not.toBe(base.vods[0]);
  });
});

describe("formToRaw / formToInput", () => {
  it("trim, 원제 공백만이면 생략, undated는 null", () => {
    const raw = formToRaw("x", form({ name: "  이름  ", originalTitle: "   ", undated: true, category: null, vods: [{ ...F1, title: " t ", url: " " + V1.url }] }));
    expect(raw).toEqual({ id: "x", name: "이름", firstPlayed: null, status: "unknown", vods: [{ title: "t", url: V1.url, date: "2026-10-10" }] });
    expect("originalTitle" in raw).toBe(false);
    expect("categoryId" in raw).toBe(false);
  });
  it("포스터 없는 카테고리는 categoryId만", () => {
    const raw = formToRaw("x", form({ category: { categoryId: "C", posterUrl: null } }));
    expect(raw.categoryId).toBe("C");
    expect("posterUrl" in raw).toBe(false);
  });
  it("빈 firstPlayed는 그대로(검증이 잡는다)", () => {
    expect(formToRaw("x", form({ firstPlayed: "" })).firstPlayed).toBe("");
  });
  it("formToInput은 id가 없다", () => {
    const input = formToInput(form());
    expect("id" in input).toBe(false);
    expect(input.name).toBe("스텔라 블레이드");
    expect(input.categoryId).toBe("Stellar_Blade");
  });
});

describe("formToPatch", () => {
  it("변화 없음은 {}", () => {
    expect(formToPatch(base, gameToForm(base))).toEqual({});
  });
  it("필드별 변경", () => {
    const patch = formToPatch(
      base,
      form({ name: "새 이름", originalTitle: "", firstPlayed: "2026-10-01", status: "clear", vods: [F2] }),
    );
    expect(patch).toEqual({ name: "새 이름", originalTitle: null, firstPlayed: "2026-10-01", status: "clear", vods: [V2] });
  });
  it("날짜 기록 없음", () => {
    expect(formToPatch(base, form({ undated: true }))).toEqual({ firstPlayed: null });
  });
  it("카테고리 해제는 category: null, 교체는 링크", () => {
    expect(formToPatch(base, form({ category: null }))).toEqual({ category: null });
    expect(formToPatch(base, form({ category: { categoryId: "N", posterUrl: null } }))).toEqual({
      category: { categoryId: "N", posterUrl: null },
    });
  });
  it("포스터만 바뀌어도 category", () => {
    expect(formToPatch(base, form({ category: { categoryId: "Stellar_Blade", posterUrl: null } }))).toEqual({
      category: { categoryId: "Stellar_Blade", posterUrl: null },
    });
  });
});

describe("changedFields / changedLabels", () => {
  it("수정 모드는 diff", () => {
    expect(changedFields(base, gameToForm(base))).toEqual([]);
    expect(changedFields(base, form({ status: "clear", vods: [F1] }))).toEqual(["status", "vods"]);
  });
  it("추가 모드는 비어 있지 않은 필드", () => {
    expect(changedFields(null, gameToForm(null))).toEqual([]);
    expect(changedFields(null, gameToForm(base))).toEqual(["name", "originalTitle", "category", "firstPlayed", "vods"]);
    expect(changedFields(null, { ...gameToForm(null), undated: true, status: "fail" })).toEqual(["firstPlayed", "status"]);
  });
  it("라벨", () => {
    expect(changedLabels(["status", "vods"])).toEqual(["정복 여부", "다시보기"]);
  });
});

describe("validateForm", () => {
  it("정상은 0개", () => {
    expect(validateForm(gameToForm(base), [other], base.id)).toEqual([]);
    expect(validateForm(gameToForm(base), [other, base], base.id)).toEqual([]);
  });
  it("이름 빈칸", () => {
    const issues = validateForm(form({ name: "  " }), [], base.id);
    expect(issues).toEqual([{ field: "name", label: "이름", message: "이름을 1~100자로 넣어 주세요." }]);
  });
  it("새 게임은 id 이슈를 버린다", () => {
    expect(validateForm({ ...gameToForm(null), name: "새 게임", undated: true }, [], null)).toEqual([]);
  });
  it("원제가 이름과 같거나 너무 길면", () => {
    expect(validateForm(form({ originalTitle: "스텔라 블레이드" }), [], base.id)[0].message).toBe("원제가 이름과 같으면 비워 두세요.");
    expect(validateForm(form({ originalTitle: "a".repeat(201) }), [], base.id)[0].message).toBe("원제는 200자까지 넣을 수 있어요.");
  });
  it("치지직 링크는 정확한 문구", () => {
    const issues = validateForm(form({ vods: [{ ...F1, url: "https://chzzk.naver.com/video/123" }] }), [], base.id);
    expect(issues).toEqual([{ field: "vods.0.url", label: "다시보기 링크", message: CHZZK_VOD_MESSAGE }]);
  });
  it("유튜브가 아닌 링크 / 중복 영상", () => {
    const bad = validateForm(form({ vods: [{ ...F1, url: "https://example.com/x" }] }), [], base.id);
    expect(bad[0].message).toBe("유튜브 영상 링크(youtube.com/watch?v=… 또는 youtu.be/…)를 넣어 주세요.");
    const dup = validateForm(form({ vods: [F1, { ...F2, url: V1.url }] }), [], base.id);
    expect(dup).toEqual([{ field: "vods.1.url", label: "다시보기 링크", message: "같은 영상이 이미 있어요." }]);
  });
  it("다시보기 제목", () => {
    expect(validateForm(form({ vods: [{ ...F1, title: " " }] }), [], base.id)).toEqual([
      { field: "vods.0.title", label: "다시보기 제목", message: "제목을 1~200자로 넣어 주세요." },
    ]);
  });
  it("날짜가 첫 플레이보다 빠르면 fix", () => {
    const issues = validateForm(form({ firstPlayed: "2026-10-12", vods: [F1, F2] }), [], base.id);
    expect(issues).toEqual([
      {
        field: "vods.0.date",
        label: "다시보기 날짜",
        message: "첫 플레이(2026.10.12)보다 빨라요.",
        fix: { kind: "setFirstPlayed", date: "2026-10-10" },
      },
    ]);
  });
  it("날짜 형식 오류", () => {
    expect(validateForm(form({ vods: [{ ...F1, date: "" }] }), [], base.id)[0]).toEqual({
      field: "vods.0.date",
      label: "다시보기 날짜",
      message: "날짜를 2026.10.25 형식으로 넣어 주세요.",
    });
  });
  it("다른 게임의 categoryId와 겹치면(숨긴 게임 포함) 중복, 자기 자신은 아님", () => {
    const dup = validateForm(form({ category: { categoryId: "Other_Cat", posterUrl: null } }), [other, base], base.id);
    expect(dup).toEqual([{ field: "category", label: "치지직 카테고리", message: "이미 목록에 있는 카테고리예요." }]);
  });
  it("Steam 스토어 포스터는 통과, 비슷한 호스트·http는 포스터 오류", () => {
    const steam = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1/library_600x900.jpg";
    expect(validateForm(form({ category: { categoryId: "Stellar_Blade", posterUrl: steam } }), [], base.id)).toEqual([]);
    for (const posterUrl of ["https://akamai.steamstatic.com/x.jpg", "http://cdn.cloudflare.steamstatic.com/x.jpg"]) {
      expect(validateForm(form({ category: { categoryId: "Stellar_Blade", posterUrl } }), [], base.id), posterUrl).toEqual([
        { field: "category", label: "치지직 카테고리", message: "포스터 주소가 올바르지 않아요. 카테고리를 다시 골라 주세요." },
      ]);
    }
  });
  it("첫 플레이·정복 여부·여러 이슈는 FIELD_ORDER 순", () => {
    const issues = validateForm(
      form({ name: "", firstPlayed: "", status: "nope" as never, vods: [{ ...F2, url: "x" }, { ...F1, title: "" }] }),
      [],
      base.id,
    );
    expect(issues.map((i) => i.field)).toEqual(["name", "firstPlayed", "status", "vods.0.url", "vods.1.title"]);
    expect(issuesHeadline(issues)).toBe("고칠 곳이 5개 있어요");
  });
});

describe("issuesToFormIssues 나머지 경로", () => {
  const f = form();
  const map = (path: string, message = "x") => issuesToFormIssues([{ path, message }], f)[0];
  it("카테고리·포스터·vods", () => {
    expect(map("categoryId", "비어 있지 않은 문자열이어야 합니다").message).toBe("카테고리를 다시 골라 주세요.");
    expect(map("posterUrl").message).toBe("포스터 주소가 올바르지 않아요. 카테고리를 다시 골라 주세요.");
    expect(map("firstPlayed")).toMatchObject({ field: "firstPlayed" });
    expect(map("vods")).toMatchObject({ field: "vods", message: "다시보기 목록이 올바르지 않아요." });
  });
  it("id·알 수 없는 경로는 name/기록 + 원본 메시지", () => {
    expect(map("id", "원본")).toEqual({ field: "name", label: "기록", message: "원본" });
    expect(map("vods[0]", "객체여야 합니다")).toEqual({ field: "name", label: "기록", message: "객체여야 합니다" });
    expect(map("")).toMatchObject({ label: "기록" });
  });
  it("같은 순위는 들어온 순서를 유지한다", () => {
    const out = issuesToFormIssues([{ path: "id", message: "a" }, { path: "name", message: "b" }], f);
    expect(out.map((i) => i.message)).toEqual(["a", "이름을 1~100자로 넣어 주세요."]);
  });
  it("범위를 벗어난 다시보기 index의 링크 이슈도 안전", () => {
    expect(map("vods[9].url")).toMatchObject({ field: "vods.9.url" });
  });
  it("날짜 이슈인데 제안할 날짜가 없으면 fix 없음", () => {
    const g = form({ undated: true });
    const issue = issuesToFormIssues([{ path: "vods[0].date", message: "첫 플레이 날짜(2026-10-12)보다 이릅니다" }], g)[0];
    expect(issue.fix).toBeUndefined();
  });
});

describe("suggestFirstPlayed / applyFix", () => {
  it("undated나 잘못된 날짜는 null", () => {
    expect(suggestFirstPlayed(form({ undated: true }))).toBeNull();
    expect(suggestFirstPlayed(form({ firstPlayed: "" }))).toBeNull();
  });
  it("이른 다시보기가 없으면 null", () => {
    expect(suggestFirstPlayed(form())).toBeNull();
  });
  it("가장 이른 날짜", () => {
    const f = form({ firstPlayed: "2026-12-01", vods: [F2, F1, { ...F1, date: "bad" }] });
    expect(suggestFirstPlayed(f)).toBe("2026-10-10");
  });
  it("applyFix는 날짜를 넣고 undated를 푼다", () => {
    expect(applyFix(form({ undated: true }), { kind: "setFirstPlayed", date: "2026-01-01" })).toMatchObject({ firstPlayed: "2026-01-01", undated: false });
  });
});

describe("fieldDomId", () => {
  it("점을 하이픈으로", () => {
    expect(fieldDomId("name")).toBe("game-edit-name");
    expect(fieldDomId("vods.0.url")).toBe("game-edit-vods-0-url");
  });
});

describe("draft", () => {
  const store = { form: gameToForm(base), baseVersion: 3, savedAt: 1_792_900_000_000 };
  it("키", () => {
    expect(draftKey("a")).toBe(`${DRAFT_KEY_PREFIX}a`);
    expect(draftKey(null)).toBe(`${DRAFT_KEY_PREFIX}new`);
  });
  it("왕복 (baseVersion null 포함)", () => {
    expect(parseDraft(serializeDraft(store))).toEqual(store);
    const n = { ...store, baseVersion: null, form: gameToForm(null) };
    expect(parseDraft(serializeDraft(n))).toEqual(n);
    const c = { ...store, form: { ...store.form, category: null } };
    expect(parseDraft(serializeDraft(c))).toEqual(c);
  });
  it("깨진 값은 null", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("{")).toBeNull();
    expect(parseDraft("[]")).toBeNull();
    expect(parseDraft('{"form":null}')).toBeNull();
    const bad = (mut: (s: Record<string, unknown>, f: Record<string, unknown>) => void) => {
      const s = JSON.parse(serializeDraft(store));
      mut(s, s.form);
      return parseDraft(JSON.stringify(s));
    };
    expect(bad((_s, f) => delete f.name)).toBeNull();
    expect(bad((_s, f) => (f.status = "x"))).toBeNull();
    expect(bad((_s, f) => (f.undated = "no"))).toBeNull();
    expect(bad((_s, f) => (f.category = { categoryId: 1 }))).toBeNull();
    expect(bad((_s, f) => (f.category = "x"))).toBeNull();
    expect(bad((_s, f) => (f.vods = "x"))).toBeNull();
    expect(bad((_s, f) => (f.vods = [{ title: 1 }]))).toBeNull();
    expect(bad((_s, f) => (f.vods = [1]))).toBeNull();
    expect(bad((s) => (s.baseVersion = "3"))).toBeNull();
    expect(bad((s) => (s.baseVersion = 1.5))).toBeNull();
    expect(bad((s) => (s.savedAt = "x"))).toBeNull();
  });
});

describe("카테고리 없는 포스터(Steam)", () => {
  const STEAM = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2455920/library_600x900.jpg?t=1766096052";
  const steamGame: Game = { id: "mimic-logic", name: "미믹 로직", originalTitle: "Mimic Logic", posterUrl: STEAM, firstPlayed: "2026-10-10", status: "unknown", vods: [V1] };

  it("gameToForm은 카테고리 밖 포스터를 posterUrl로 남긴다", () => {
    const f = gameToForm(steamGame);
    expect(f.category).toBeNull();
    expect(f.posterUrl).toBe(STEAM);
    expect(formPosterUrl(f)).toBe(STEAM);
    expect("posterUrl" in gameToForm(base)).toBe(false);
  });
  it("열고 그대로면 변화 없음(포스터를 지우지 않는다)", () => {
    expect(formToPatch(steamGame, gameToForm(steamGame))).toEqual({});
    expect(changedFields(steamGame, gameToForm(steamGame))).toEqual([]);
    expect(formToRaw(steamGame.id, gameToForm(steamGame)).posterUrl).toBe(STEAM);
  });
  it("이름만 고치면 name만 보낸다", () => {
    expect(formToPatch(steamGame, { ...gameToForm(steamGame), name: "미믹 로직 2" })).toEqual({ name: "미믹 로직 2" });
  });
  it("카테고리 포스터가 우선, 카테고리 포스터가 없으면 Steam 포스터", () => {
    const linked = { ...gameToForm(steamGame), category: { categoryId: "C", posterUrl: POSTER } };
    expect(formPosterUrl(linked)).toBe(POSTER);
    expect(formToPatch(steamGame, linked)).toEqual({ category: { categoryId: "C", posterUrl: POSTER } });
    const bare = { ...gameToForm(steamGame), category: { categoryId: "C", posterUrl: null } };
    expect(formPosterUrl(bare)).toBe(STEAM);
    expect(formToRaw("x", bare)).toMatchObject({ categoryId: "C", posterUrl: STEAM });
    expect(formToPatch(steamGame, bare)).toEqual({ category: { categoryId: "C", posterUrl: null }, posterUrl: STEAM });
  });
  it("포스터 없는 폼", () => {
    expect(formPosterUrl(gameToForm(null))).toBeNull();
    expect(formPosterUrl(form({ category: { categoryId: "C", posterUrl: null } }))).toBeNull();
  });
  it("draft 왕복, 옛 draft(posterUrl 없음)도 읽는다", () => {
    const s = { form: gameToForm(steamGame), baseVersion: 2, savedAt: 1 };
    expect(parseDraft(serializeDraft(s))).toEqual(s);
    const old = { form: gameToForm(base), baseVersion: 2, savedAt: 1 };
    expect(parseDraft(serializeDraft(old))).toEqual(old);
    const broken = JSON.parse(serializeDraft(s));
    broken.form.posterUrl = 1;
    expect(parseDraft(JSON.stringify(broken))).toBeNull();
  });

  describe("카테고리 C + Steam 포스터(카테고리 포스터 없음)로 저장된 게임", () => {
    const linkedSteam: Game = { ...steamGame, categoryId: "C" };

    it("gameToForm은 Steam 포스터를 카테고리 포스터가 아니라 posterUrl로 연다", () => {
      const f = gameToForm(linkedSteam);
      expect(f.category).toEqual({ categoryId: "C", posterUrl: null });
      expect(f.posterUrl).toBe(STEAM);
      expect(formToPatch(linkedSteam, f)).toEqual({});
    });
    it("포스터 없는 다른 카테고리로 바꿔도 Steam 포스터를 지우지 않는다", () => {
      const f = { ...gameToForm(linkedSteam), category: { categoryId: "D", posterUrl: null } };
      expect(formToPatch(linkedSteam, f)).toEqual({ category: { categoryId: "D", posterUrl: null }, posterUrl: STEAM });
    });
    it("포스터 있는 카테고리로 바꾸면 카테고리 포스터가 이긴다", () => {
      const f = { ...gameToForm(linkedSteam), category: { categoryId: "D", posterUrl: POSTER } };
      expect(formToPatch(linkedSteam, f)).toEqual({ category: { categoryId: "D", posterUrl: POSTER } });
    });
    it("연결을 해제해도 Steam 포스터는 남는다", () => {
      expect(unlinkKeepsPoster(gameToForm(linkedSteam))).toBe(true);
      expect(unlinkKeepsPoster(gameToForm(base))).toBe(false);
      const f = { ...gameToForm(linkedSteam), category: null };
      expect(formPosterUrl(f)).toBe(STEAM);
      expect(formToPatch(linkedSteam, f)).toEqual({ category: null, posterUrl: STEAM });
    });
    it("치지직 카테고리 포스터는 지금처럼 category.posterUrl로 연다", () => {
      const f = gameToForm(base);
      expect(f.category).toEqual({ categoryId: base.categoryId, posterUrl: POSTER });
      expect("posterUrl" in f).toBe(false);
    });
  });
});

describe("하이라이트 시작", () => {
  const hgame: Game = { ...base, vods: [{ ...V1, highlightStart: 5025 }, { ...V2, highlightStart: 0 }] };
  it("gameToForm: 초 → 사람용 시각, 없으면 \"\"", () => {
    expect(gameToForm(hgame).vods.map((v) => v.highlight)).toEqual(["1:23:45", "0:00"]);
    expect(gameToForm(base).vods.map((v) => v.highlight)).toEqual(["", ""]);
  });
  it("formToRaw: \"\"는 키 없음, 읽으면 초, 못 읽으면 원문 그대로", () => {
    const raw = formToRaw("x", form({ vods: [{ ...F1, highlight: "  " }, { ...F2, highlight: " 83:20 " }] }));
    const vods = raw.vods as Record<string, unknown>[];
    expect("highlightStart" in vods[0]).toBe(false);
    expect(vods[1].highlightStart).toBe(5000);
    const bad = formToRaw("x", form({ vods: [{ ...F1, highlight: "abc" }] }));
    expect((bad.vods as Record<string, unknown>[])[0].highlightStart).toBe("abc");
  });
  it("validateForm: 잘못된 시각은 vods.N.highlight 이슈", () => {
    expect(validateForm(form({ vods: [F1, { ...F2, highlight: "25:00:00" }] }), [], base.id)).toEqual([
      { field: "vods.1.highlight", label: "하이라이트 시작", message: "1:23:45처럼 24시간 안의 시각을 넣어 주세요." },
    ]);
    expect(validateForm(form({ vods: [{ ...F1, highlight: "1:23:45" }] }), [], base.id)).toEqual([]);
  });
  it("issuesToFormIssues: highlight는 같은 행 date 뒤, 다음 행 title 앞", () => {
    const out = issuesToFormIssues(
      [
        { path: "vods[1].title", message: "x" },
        { path: "vods[0].highlightStart", message: "x" },
        { path: "vods[0].date", message: "x" },
      ],
      form(),
    );
    expect(out.map((i) => i.field)).toEqual(["vods.0.date", "vods.0.highlight", "vods.1.title"]);
  });
  it("formToPatch: 하이라이트만 바꾸면 { vods }", () => {
    const patch = formToPatch(base, form({ vods: [{ ...F1, highlight: "1:00" }, F2] }));
    expect(patch).toEqual({ vods: [{ ...V1, highlightStart: 60 }, V2] });
    expect(formToPatch(hgame, gameToForm(hgame))).toEqual({});
    expect(changedFields(hgame, { ...gameToForm(hgame), vods: gameToForm(hgame).vods.map((v) => ({ ...v, highlight: "" })) })).toEqual(["vods"]);
  });
  it("normalizeHighlight: 읽으면 정규화, 빈 값은 \"\", 못 읽으면 원문", () => {
    expect(normalizeHighlight("83:20")).toBe("1:23:20");
    expect(normalizeHighlight(" 90s ")).toBe("1:30");
    expect(normalizeHighlight("   ")).toBe("");
    expect(normalizeHighlight("abc")).toBe("abc");
  });
  it("parseDraft: 옛 초안(highlight 없음)은 \"\"로 채우고, 숫자면 버린다", () => {
    const store = { form: gameToForm(hgame), baseVersion: 1, savedAt: 1 };
    expect(parseDraft(serializeDraft(store))).toEqual(store);
    const old = JSON.parse(serializeDraft(store));
    for (const v of old.form.vods) delete v.highlight;
    expect(parseDraft(JSON.stringify(old))?.form.vods.map((v) => v.highlight)).toEqual(["", ""]);
    const broken = JSON.parse(serializeDraft(store));
    broken.form.vods[0].highlight = 5025;
    expect(parseDraft(JSON.stringify(broken))).toBeNull();
  });
});

describe("마지막 플레이(정본)", () => {
  // base: firstPlayed 2026-10-10, 다시보기 2026-10-10·2026-10-15
  it("gameToForm: 저장값을 열고, 없으면 \"\"", () => {
    expect(gameToForm({ ...base, lastPlayed: "2026-11-01" }).lastPlayed).toBe("2026-11-01");
    expect(gameToForm(base).lastPlayed).toBe("");
  });
  it("formToRaw: 비우면 키 없음, 값은 원문 그대로", () => {
    expect("lastPlayed" in formToRaw("x", form())).toBe(false);
    expect(formToRaw("x", form({ lastPlayed: "2026-11-01" })).lastPlayed).toBe("2026-11-01");
    expect(formToRaw("x", form({ lastPlayed: "2026-1" })).lastPlayed).toBe("2026-1");
    expect(formToInput(form({ lastPlayed: "2026-11-01" })).lastPlayed).toBe("2026-11-01");
  });
  it("formToPatch: 넣기·바꾸기는 값, 비우기는 null, 그대로면 키 없음", () => {
    expect(formToPatch(base, form({ lastPlayed: "2026-11-01" }))).toEqual({ lastPlayed: "2026-11-01" });
    const saved = { ...base, lastPlayed: "2026-11-01" };
    expect(formToPatch(saved, { ...gameToForm(saved), lastPlayed: "" })).toEqual({ lastPlayed: null });
    expect(formToPatch(saved, gameToForm(saved))).toEqual({});
  });
  it("changedFields(추가): 값이 있으면 lastPlayed", () => {
    expect(changedFields(null, { ...gameToForm(null), lastPlayed: "2026-11-01" })).toEqual(["lastPlayed"]);
    expect(changedLabels(["lastPlayed"])).toEqual(["마지막 플레이"]);
  });
  it("validateForm: 첫 플레이보다 이르면, 형식이 틀리면 마지막 플레이 이슈", () => {
    const early = validateForm(form({ lastPlayed: "2026-10-01" }), [other], base.id);
    expect(early).toEqual([{ field: "lastPlayed", label: "마지막 플레이", message: "첫 플레이(2026.10.10)보다 빨라요." }]);
    const bad = validateForm(form({ lastPlayed: "2026-13-01" }), [other], base.id);
    expect(bad).toEqual([{ field: "lastPlayed", label: "마지막 플레이", message: "날짜를 2026.10.25 형식으로 넣거나 비워 두세요." }]);
    expect(validateForm(form({ lastPlayed: "2026-10-12" }), [other], base.id)).toEqual([]);
  });
  it("issuesToFormIssues: 첫 플레이 다음, 정복 여부 앞 순서", () => {
    const issues = issuesToFormIssues(
      [
        { path: "status", message: "x" },
        { path: "lastPlayed", message: "x" },
        { path: "firstPlayed", message: "x" },
      ],
      form(),
    );
    expect(issues.map((i) => i.field)).toEqual(["firstPlayed", "lastPlayed", "status"]);
  });
  it("formToInput(추가): 비우면 첫 플레이 날짜로 채운다, 날짜 기록 없음이면 키 없음, 값이 있으면 그 값", () => {
    const empty = gameToForm(null);
    expect(formToInput({ ...empty, name: "x", firstPlayed: "2026-01-02" }).lastPlayed).toBe("2026-01-02");
    expect("lastPlayed" in formToInput({ ...empty, name: "x", undated: true })).toBe(false);
    expect(formToInput({ ...empty, name: "x", firstPlayed: "2026-01-02", lastPlayed: "2026-03-03" }).lastPlayed).toBe("2026-03-03");
    // 수정(formToRaw·formToPatch)은 채우지 않는다: 저장값 없는 게임을 고쳐도 마지막 플레이가 바뀐 것으로 보이지 않는다
    expect(formToPatch(base, form({ name: "새 이름" }))).toEqual({ name: "새 이름" });
  });
  it("effectiveLastPlayed: 유효한 입력값 → 첫 플레이 → null", () => {
    expect(effectiveLastPlayed(form({ lastPlayed: "2026-11-01" }))).toBe("2026-11-01");
    expect(effectiveLastPlayed(form())).toBe("2026-10-10");
    expect(effectiveLastPlayed(form({ lastPlayed: "2026-1" }))).toBe("2026-10-10");
    expect(effectiveLastPlayed(form({ undated: true }))).toBeNull();
    expect(effectiveLastPlayed(form({ firstPlayed: "2026-10" }))).toBeNull();
    expect(effectiveLastPlayed(form({ undated: true, lastPlayed: "2026-11-01" }))).toBe("2026-11-01");
  });
  it("raiseLastPlayed: 바뀐 다시보기 날짜가 더 늦으면 올리고, 같거나 이르면 그대로, 내리지 않는다", () => {
    const late = { ...F2, date: "2026-11-20" };
    // 저장값 없음 → 첫 플레이(2026-10-10)보다 늦으니 올린다
    expect(raiseLastPlayed(form(), [F1, late], late.date)).toEqual({ ...form(), vods: [F1, late], lastPlayed: "2026-11-20" });
    // 저장값보다 늦으면 올린다
    expect(raiseLastPlayed(form({ lastPlayed: "2026-11-01" }), [late], late.date).lastPlayed).toBe("2026-11-20");
    // 같은 날이면 그대로
    expect(raiseLastPlayed(form({ lastPlayed: "2026-11-20" }), [late], late.date).lastPlayed).toBe("2026-11-20");
    expect(raiseLastPlayed(form({ vods: [] }), [{ ...F1, date: "2026-10-10" }], "2026-10-10").lastPlayed).toBe("");
    // 이르면 그대로(사용자가 손으로 넣은 더 늦은 값이 이긴다)
    expect(raiseLastPlayed(form({ lastPlayed: "2026-12-01" }), [late], late.date).lastPlayed).toBe("2026-12-01");
    // 마지막 플레이가 없으면(날짜 기록 없음·첫 플레이 미입력) 유효한 다시보기 날짜로 정한다
    expect(raiseLastPlayed(form({ undated: true }), [late], late.date).lastPlayed).toBe("2026-11-20");
    expect(raiseLastPlayed(gameToForm(null), [late], late.date).lastPlayed).toBe("2026-11-20");
    // 틀린 날짜는 보지 않는다(다시보기는 바꾼다)
    const bad = { ...F2, date: "2026-11" };
    expect(raiseLastPlayed(form(), [bad], bad.date)).toEqual({ ...form(), vods: [bad] });
    // 입력 폼을 바꾸지 않는다
    const f = form();
    raiseLastPlayed(f, [late], late.date);
    expect(f).toEqual(form());
  });
  it("raiseLastPlayed: 바뀐 다시보기만 본다. 사용자가 되돌린 값을 다른 늦은 다시보기로 다시 올리지 않는다", () => {
    const a = { ...F1, date: "2026-10-05" };
    const b = { ...F2, date: "2026-10-02" };
    // A(10-05)는 이미 있고, 사용자가 마지막 플레이를 10-01로 되돌렸다. B(10-02)를 넣으면 B의 날짜로만 올린다
    const reverted = form({ firstPlayed: "2026-09-01", lastPlayed: "2026-10-01", vods: [a] });
    expect(raiseLastPlayed(reverted, [b, a], b.date).lastPlayed).toBe("2026-10-02");
    // B보다 이른 날로 되돌렸어도 A의 날짜(10-05)로는 올라가지 않는다
    const reverted2 = form({ firstPlayed: "2026-09-01", lastPlayed: "2026-10-03", vods: [a, b] });
    expect(raiseLastPlayed(reverted2, [a, b], b.date).lastPlayed).toBe("2026-10-03");
  });
  it("lastPlayedHint: 각 분기", () => {
    expect(lastPlayedHint(gameToForm(null))).toBe("비워 두면 첫 플레이 날짜를 써요.");
    expect(lastPlayedHint(form())).toBe("비워 두면 첫 플레이 날짜(2026.10.10)를 써요.");
    expect(lastPlayedHint(form({ firstPlayed: "2026-10" }))).toBe("비워 두면 첫 플레이 날짜를 써요.");
    expect(lastPlayedHint(form({ undated: true }))).toBe("비워 두면 날짜 기록 없음으로 둬요.");
    expect(lastPlayedHint(form({ lastPlayed: "2026-11-01" }))).toBe("더 늦은 다시보기를 넣으면 함께 올라가요.");
  });
  it("draft: 왕복하고, lastPlayed가 없는 옛 초안은 \"\", 문자열이 아니면 null", () => {
    const store = { form: form({ lastPlayed: "2026-11-01" }), baseVersion: 3, savedAt: 1 };
    expect(parseDraft(serializeDraft(store))).toEqual(store);
    const old = JSON.parse(serializeDraft(store));
    delete old.form.lastPlayed;
    expect(parseDraft(JSON.stringify(old))?.form.lastPlayed).toBe("");
    old.form.lastPlayed = 1;
    expect(parseDraft(JSON.stringify(old))).toBeNull();
  });
});
