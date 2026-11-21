// 서버: 보이는 게임 → 어워즈 후보(번호 붙은 최소 필드). 부문 후보 거르기는 클라이언트도 쓴다.
import { sizeOptions } from "./options.ts";
import { highlightVod, namedYoutubeVod } from "../games/media.ts";
import { copyVod } from "../games/rows.ts";
import { indexGames } from "../games/query.ts";
import type { Game } from "../games/types.ts";
import type { AwardEntry, Division } from "./types.ts";

export const DIVISIONS: readonly Division[] = ["alltime", "2026"];
export const AWARDS_YEAR = "2026";
export const DIVISION_LABEL: Record<Division, string> = { alltime: "올타임 부문", "2026": "2026 부문" };

/** 보이는 게임(숨김 제외, 로더가 보장) → 번호 붙은 최소 항목. 반환 순서는 indexGames 순서(canonical, 최신 먼저).
 *  필드별로 옮긴다(스프레드 금지: categoryId·hidden·version 등이 새지 않게) */
export function toAwardEntries(visible: readonly Game[]): AwardEntry[] {
  return indexGames(visible).map((game) => {
    const entry: AwardEntry = {
      id: game.id,
      name: game.name,
      firstPlayed: game.firstPlayed,
      status: game.status,
      vods: [],
      ordinal: game.ordinal,
      no: game.no,
    };
    if (game.originalTitle !== undefined) entry.originalTitle = game.originalTitle;
    if (game.posterUrl !== undefined) entry.posterUrl = game.posterUrl;
    // 현장 사진(namedYoutubeVod)과 하이라이트(highlightVod) 편만 보낸다. 원래 순서(날짜순)를 유지하고 같은 편이면 하나만.
    // 두 편을 포함하고 순서가 같은 부분집합이라 각 "첫 편"이 바뀌지 않는다(AwardEntry.vods 불변식)
    const named = namedYoutubeVod(game)?.vod;
    const clip = highlightVod(game)?.vod;
    entry.vods = game.vods.filter((v) => v === named || v === clip).map(copyVod);
    return entry;
  });
}

/** 부문 술어(서버 후보·순위와 클라이언트 후보 공용). alltime = 언제나, 2026 = 첫 플레이 연도가 AWARDS_YEAR
 *  (/games 연도 필터 filterGames year와 같은 기준, null이면 빠진다) */
export function inDivision(firstPlayed: string | null, division: Division): boolean {
  return division === "alltime" || firstPlayed?.slice(0, 4) === AWARDS_YEAR;
}

/** 부문 후보(새 배열, 순서 유지) */
export function divisionEntries(entries: readonly AwardEntry[], division: Division): AwardEntry[] {
  return entries.filter((e) => inDivision(e.firstPlayed, division));
}

/** 부문을 시작할 수 있는가 = 보이는 강이 하나라도 있다(가장 작은 4강에 후보 3개 이상) */
export function divisionAvailable(count: number): boolean {
  return sizeOptions(count).length > 0;
}

/** 설정 화면의 처음 부문: 2026 부문. 2026 후보가 3개 미만이라(divisionAvailable 거짓) 시작할 수 없으면 올타임 */
export function defaultDivision(counts: Record<Division, number>): Division {
  return divisionAvailable(counts["2026"]) ? "2026" : "alltime";
}

/** 3·4위전 체크박스의 처음 값 */
export const DEFAULT_THIRD_PLACE = false;
