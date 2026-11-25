// /games 목록의 연도 챕터와 일지(월 묶음). 목록은 페이지로 나누지 않고 필터 결과 전체를 첫 플레이 연도별 챕터로 묶는다.
import type { Game, GamesQueryState } from "./types.ts";

export interface YearChapter<T> {
  /** React key·앵커. "2025" 또는 "none"(날짜 기록 없음) */
  key: string;
  /** year는 Fredoka 숫자, none은 한글 문구(Fredoka에 한글 글리프가 없다) */
  kind: "year" | "none";
  /** 챕터 번호 "01"부터(/about 챕터 번호와 같은 표기) */
  no: string;
  /** 보이는 제목. "2025" 또는 "날짜 기록 없음" */
  heading: string;
  /** 이 챕터의 게임 수 */
  count: number;
  /** 그중 정복 수 */
  clear: number;
  /** "24개 · 정복 18". 상태 필터가 걸려 있으면 정복 수는 뜻이 없어 "24개"만 */
  countText: string;
  /** 이 챕터의 게임(입력 순서 유지) */
  items: T[];
}

const yearKey = (game: Game): string => game.firstPlayed?.slice(0, 4) ?? "none";

/**
 * 필터·정렬을 마친 목록(selectGames 결과)을 연도 챕터로 묶는다. 이름순이면 null(챕터 없음).
 * recent·old 모두 날짜 없는 게임이 맨 뒤라 연속 구간으로 묶으면 연도당 한 챕터가 된다.
 * 관리자가 "숨긴 게임 보기"를 켰을 때는 넘겨받은 목록에 숨긴 게임이 있어 그 연도 개수에도 들어간다(카드와 개수가 맞는다).
 */
export function yearChapters<T extends Game>(
  items: readonly T[],
  state: Pick<GamesQueryState, "sort" | "status">,
): YearChapter<T>[] | null {
  if (state.sort === "name") return null;
  const chapters: YearChapter<T>[] = [];
  for (const item of items) {
    const key = yearKey(item);
    let last = chapters.at(-1);
    if (last?.key !== key) {
      last = {
        key,
        kind: key === "none" ? "none" : "year",
        no: String(chapters.length + 1).padStart(2, "0"),
        heading: key === "none" ? "날짜 기록 없음" : key,
        count: 0,
        clear: 0,
        countText: "",
        items: [],
      };
      chapters.push(last);
    }
    last.items.push(item);
    last.count += 1;
    if (item.status === "clear") last.clear += 1;
  }
  for (const c of chapters) {
    c.countText = state.status === "all" ? `${c.count}개 · 정복 ${c.clear}` : `${c.count}개`;
  }
  return chapters;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export interface DiaryRow<T> {
  game: T;
  /** 날짜 칸 "20". 같은 달에서 바로 앞 줄과 같은 날이거나 날짜가 없으면 null(첫 줄에만 적는다) */
  day: string | null;
}

export interface DiaryMonth<T> {
  /** "2026-11" 또는 "none" */
  key: string;
  kind: "month" | "none";
  /** 월 배지 "NOV". 날짜 없으면 null */
  month: string | null;
  /** 월 배지 아래 연도 "2026". 날짜 없으면 null */
  year: string | null;
  /** 스크린리더·제목용 "2026년 11월" 또는 "날짜 기록 없음" */
  label: string;
  rows: DiaryRow<T>[];
}

/** 일지 보기: 정렬된 목록(한 연도 챕터의 items 등)을 첫 플레이 월별로 묶는다. 연속 구간으로 묶으므로 날짜순 목록에 쓴다 */
export function diaryMonths<T extends Game>(items: readonly T[]): DiaryMonth<T>[] {
  const months: DiaryMonth<T>[] = [];
  for (const game of items) {
    const key = game.firstPlayed?.slice(0, 7) ?? "none";
    let last = months.at(-1);
    if (last?.key !== key) {
      const [y, m] = key.split("-");
      last =
        key === "none"
          ? { key, kind: "none", month: null, year: null, label: "날짜 기록 없음", rows: [] }
          : { key, kind: "month", month: MONTHS[Number(m) - 1], year: y, label: `${y}년 ${Number(m)}월`, rows: [] };
      months.push(last);
    }
    const day = game.firstPlayed?.slice(8, 10) ?? null;
    const prev = last.rows.at(-1);
    last.rows.push({ game, day: prev !== undefined && prev.game.firstPlayed === game.firstPlayed ? null : day });
  }
  return months;
}
