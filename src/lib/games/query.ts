import { compareCanonical, compareName, GAME_STATUSES, ID_PATTERN } from "./schema.ts";
import type {
  IndexedGame,
  Game,
  GamesQueryState,
  GameStats,
  QueryInput,
  SortKey,
  StatusFilter,
  YearFilter,
  ViewKey,
  YearOptions,
} from "./types.ts";

export const Q_MAX = 100;
export const DEFAULT_QUERY_STATE: Readonly<GamesQueryState> = Object.freeze({
  q: "",
  status: "all",
  year: "all",
  sort: "recent",
  view: "grid",
});

export function normalize(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const CHOSEONG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

export function toInitials(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xac00 && code <= 0xd7a3) {
      out += CHOSEONG[Math.floor((code - 0xac00) / 588)];
    } else {
      out += ch;
    }
  }
  return out;
}

export function matchesQuery(
  game: Pick<Game, "name" | "originalTitle">,
  query: string,
): boolean {
  const nq = normalize(query);
  if (nq === "") return true;
  for (const target of [game.name, game.originalTitle]) {
    if (target === undefined) continue;
    const h = normalize(target);
    if (h === "") continue;
    if (h.includes(nq) || toInitials(h).includes(nq)) return true;
  }
  return false;
}

export function filterGames<T extends Game>(
  games: readonly T[],
  state: Pick<GamesQueryState, "q" | "status" | "year">,
): T[] {
  return games.filter((game) => {
    if (state.status !== "all" && game.status !== state.status) return false;
    if (state.year === "none") {
      if (game.firstPlayed !== null) return false;
    } else if (state.year !== "all") {
      if (game.firstPlayed?.slice(0, 4) !== state.year) return false;
    }
    return matchesQuery(game, state.q);
  });
}

/** UI 노출 순서 그대로 */
export const STATUS_FILTERS: readonly StatusFilter[] = ["all", ...GAME_STATUSES];
export const SORT_KEYS: readonly SortKey[] = ["recent", "old", "name"];
export const VIEW_KEYS: readonly ViewKey[] = ["grid", "diary"];

type Year = `${number}`;
const isYear = (s: string): s is Year => /^\d{4}$/.test(s);

function pick(input: QueryInput, key: string): string | undefined {
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
  const v = input[key];
  return Array.isArray(v) ? v[0] : v;
}

/** 검색어 정규화: trim → Q_MAX(UTF-16 단위, input maxLength와 같은 기준)로 자름 → 끊긴 서로게이트·끝 공백 제거. 멱등 */
export function normalizeQ(raw: string): string {
  let t = raw.trim().slice(0, Q_MAX);
  if (/[\uD800-\uDBFF]$/.test(t)) t = t.slice(0, -1);
  return t.trimEnd();
}

/** "all" | "none" | "YYYY". 나머지는 "all" */
export function parseYearFilter(v: string | undefined): YearFilter {
  if (v === "none") return "none";
  return v !== undefined && isYear(v) ? v : "all";
}

/** "recent" | "old" | "name". 나머지는 "recent" */
export function parseSortKey(v: string | undefined): SortKey {
  return SORT_KEYS.find((k) => k === v) ?? "recent";
}

export function parseQueryState(input: QueryInput): GamesQueryState {
  const status = pick(input, "status");
  const view = pick(input, "view");
  // 예전 공유 링크의 page는 읽지 않는다(연도 챕터로 바뀌어 페이지가 없다). 다시 쓸 때 사라진다
  return {
    q: normalizeQ(pick(input, "q") ?? ""),
    status: STATUS_FILTERS.find((v) => v === status) ?? "all",
    year: parseYearFilter(pick(input, "year")),
    sort: parseSortKey(pick(input, "sort")),
    view: VIEW_KEYS.find((v) => v === view) ?? "grid",
  };
}

/** 연도 select 옵션: all, 연도 내림차순, none(날짜 없는 게임이 있을 때).
 *  URL로 들어온, 데이터에 없는 현재 값도 select가 보여 줄 수 있게 제자리에 끼운다. */
export function yearFilterOptions(options: YearOptions, current: YearFilter): YearFilter[] {
  const years: Year[] = [...options.years];
  if (current !== "all" && current !== "none" && !years.includes(current)) {
    years.push(current);
    years.sort().reverse();
  }
  const out: YearFilter[] = ["all", ...years];
  if (options.hasUndated || current === "none") out.push("none");
  return out;
}

export function serializeQueryState(state: GamesQueryState): string {
  const params = new URLSearchParams();
  const q = state.q.trim();
  if (q !== "") params.set("q", q);
  if (state.status !== DEFAULT_QUERY_STATE.status) params.set("status", state.status);
  if (state.year !== DEFAULT_QUERY_STATE.year) params.set("year", state.year);
  if (state.sort !== DEFAULT_QUERY_STATE.sort) params.set("sort", state.sort);
  if (state.view !== DEFAULT_QUERY_STATE.view) params.set("view", state.view);
  return params.toString();
}

/** 상세로 열린 게임 ID(`game` 파라미터). 형식이 틀리면 null */
export function parseDetailId(input: QueryInput): string | null {
  const id = pick(input, "game");
  return id !== undefined && ID_PATTERN.test(id) ? id : null;
}

/** 목록 상태 + 상세 게임 ID의 쿼리 문자열. id가 null이면 목록 상태만 */
export function detailQuery(state: GamesQueryState, id: string | null): string {
  const params = new URLSearchParams(serializeQueryState(state));
  if (id !== null) params.set("game", id);
  return params.toString();
}

export function applyFilterChange(
  state: GamesQueryState,
  patch: Partial<GamesQueryState>,
): GamesQueryState {
  return { ...state, ...patch };
}

export function countStats(games: readonly Game[]): GameStats {
  const stats: GameStats = { total: games.length, clear: 0, fail: 0, endless: 0, unknown: 0, undated: 0 };
  for (const game of games) {
    stats[game.status] += 1;
    if (game.firstPlayed === null) stats.undated += 1;
  }
  return stats;
}

export function availableYears(games: readonly Game[]): YearOptions {
  const years = new Set<Year>();
  let hasUndated = false;
  for (const game of games) {
    if (game.firstPlayed === null) hasUndated = true;
    else {
      const y = game.firstPlayed.slice(0, 4);
      if (isYear(y)) years.add(y);
    }
  }
  return { years: [...years].sort().reverse(), hasUndated };
}

export function formatDate(iso: string | null): string {
  return iso === null ? "날짜 기록 없음" : iso.replaceAll("-", ".");
}

function compareOld(a: Game, b: Game): number {
  if (a.firstPlayed === b.firstPlayed) return compareName(a, b);
  if (a.firstPlayed === null) return 1;
  if (b.firstPlayed === null) return -1;
  return a.firstPlayed < b.firstPlayed ? -1 : 1;
}

export function sortGames<T extends Game>(games: readonly T[], sort: SortKey): T[] {
  const compare =
    sort === "recent" ? compareCanonical : sort === "old" ? compareOld : compareName;
  return [...games].sort(compare);
}

export function indexGames(games: readonly Game[]): IndexedGame[] {
  const sorted = sortGames(games, "recent");
  return sorted.map((game, i) => {
    const ordinal = sorted.length - i;
    return { ...game, ordinal, no: String(ordinal).padStart(3, "0") };
  });
}

/** 필터 → 정렬. 나누지 않고 전부 돌려준다(연도 챕터는 yearChapters가 묶는다) */
export function selectGames<T extends Game>(games: readonly T[], state: GamesQueryState): T[] {
  return sortGames(filterGames(games, state), state.sort);
}

/** 상태 버튼에 적을 개수: 그 상태를 골랐을 때의 결과 수. 검색어·연도는 반영하고 지금 고른 상태는 무시한다 */
export function statusCounts(games: readonly Game[], state: GamesQueryState): Record<StatusFilter, number> {
  const out: Record<StatusFilter, number> = { all: 0, clear: 0, fail: 0, endless: 0, unknown: 0 };
  for (const game of filterGames(games, { q: state.q, year: state.year, status: "all" })) {
    out.all += 1;
    out[game.status] += 1;
  }
  return out;
}

/** 숨기지 않은 게임만 indexGames 규칙으로 번호를 매기고, 숨긴 게임은 ordinal 0·no "—"로 붙인다. 입력 순서는 상관없음 */
export function indexWithHidden<T extends Game & { hidden: boolean }>(games: readonly T[]): Array<T & IndexedGame> {
  const numbered = new Map<string, IndexedGame>(indexGames(games.filter((g) => !g.hidden)).map((g) => [g.id, g]));
  return games.map((g) => {
    const n = numbered.get(g.id);
    return { ...g, ordinal: n?.ordinal ?? 0, no: n?.no ?? "—" };
  });
}
