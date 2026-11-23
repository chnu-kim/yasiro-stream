// 플레이 날짜 계산의 정본. 마지막 플레이는 저장값(games.last_played, 0014)이 정본이고 다시보기 날짜는 보지 않는다(#60).
// 채널·다시보기 목록이 바뀌어도 플레이 기간이 흔들리지 않게 하려는 것이다. scripts에서도 import될 수 있어 erasable 구문만 쓴다.

/** 플레이 날짜 계산에 필요한 최소 필드. Game·GameRecord·폼에서 만든 값이 모두 만족한다 */
export interface PlayedDates {
  firstPlayed: string | null;
  /** 마지막 플레이(저장 열 last_played, 0014). 없으면 키 없음 */
  lastPlayed?: string;
}

/** 마지막 플레이 = 저장값, 없으면 첫 플레이, 둘 다 없으면 null */
export function lastPlayedOf(g: PlayedDates): string | null {
  return g.lastPlayed ?? g.firstPlayed ?? null;
}

/** 가장 이른 플레이 = 첫 플레이, 없으면 마지막 플레이, 둘 다 없으면 null */
export function earliestPlayedOf(g: PlayedDates): string | null {
  return g.firstPlayed ?? g.lastPlayed ?? null;
}

/** 그 해에 했는가 = [earliestPlayedOf, lastPlayedOf] 구간이 year-01-01..year-12-31과 겹친다. 날짜가 없으면 false.
 *  검증된 YYYY-MM-DD라 문자열 비교 = 날짜 비교 */
export function playedInYear(g: PlayedDates, year: string): boolean {
  const start = earliestPlayedOf(g);
  const end = lastPlayedOf(g);
  return start !== null && end !== null && start <= `${year}-12-31` && end >= `${year}-01-01`;
}
