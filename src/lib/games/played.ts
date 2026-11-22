// 플레이 날짜 계산의 정본. 실제 마지막 플레이는 저장하지 않고 여기서만 계산한다(SQL에서 max(date)를 따로 내지 않는다).
// scripts에서도 import될 수 있어 erasable 구문만 쓴다.

/** 플레이 날짜 계산에 필요한 최소 필드. Game·GameRecord·폼에서 만든 값이 모두 만족한다 */
export interface PlayedDates {
  firstPlayed: string | null;
  /** 관리자 보정값(저장 열 last_played, 0014). 없으면 키 없음 */
  lastPlayed?: string;
  vods: readonly { date: string }[];
}

/** 알려진 플레이 날짜 전부: 다시보기 date + firstPlayed(있으면) + lastPlayed(있으면).
 *  검증된 YYYY-MM-DD라 문자열 비교 = 날짜 비교 */
function knownDates(g: PlayedDates): string[] {
  const dates = g.vods.map((v) => v.date);
  if (g.firstPlayed !== null) dates.push(g.firstPlayed);
  if (g.lastPlayed !== undefined) dates.push(g.lastPlayed);
  return dates;
}

function pick(g: PlayedDates, better: (a: string, b: string) => boolean): string | null {
  let out: string | null = null;
  for (const d of knownDates(g)) if (out === null || better(d, out)) out = d;
  return out;
}

/** 실제 마지막 플레이 = max(첫 플레이, 다시보기 날짜들, 보정값). 하나도 없으면 null. 다시보기 순서와 무관 */
export function lastPlayedOf(g: PlayedDates): string | null {
  return pick(g, (a, b) => a > b);
}

/** 가장 이른 알려진 날짜(최솟값). 하나도 없으면 null.
 *  검증된 데이터에서는 firstPlayed가 있으면 그 값이다(다시보기·lastPlayed ≥ firstPlayed) */
export function earliestPlayedOf(g: PlayedDates): string | null {
  return pick(g, (a, b) => a < b);
}

/** 그 해에 했는가 = [earliestPlayedOf, lastPlayedOf] 구간이 year-01-01..year-12-31과 겹친다. 날짜가 없으면 false */
export function playedInYear(g: PlayedDates, year: string): boolean {
  const start = earliestPlayedOf(g);
  const end = lastPlayedOf(g);
  return start !== null && end !== null && start <= `${year}-12-31` && end >= `${year}-01-01`;
}
