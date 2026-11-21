// 집계 순위. 순수 함수(행은 repo.loadRankingRows가 읽는다).
export const RANKING_LIMIT = 10;
/** 승률 목록에 오르는 최소 대결 수(부전승 제외). 한 판에 게임마다 평균 2판쯤 치르므로 1~2판 100%가 맨 위에 오지 않게 한다 */
export const MIN_DECIDED_MATCHES = 10;

export interface TallyRow {
  id: string;
  appearances: number;
  championships: number;
  wins: number;
  losses: number;
}

export interface Rankings {
  /** 그 부문에 제출된 판 수(숨긴 게임과 무관) */
  runs: number;
  minMatches: number;
  byChampionships: TallyRow[];
  byWinRate: TallyRow[];
}

const matches = (r: TallyRow) => r.wins + r.losses;
/** 승률 내림차순. 교차곱으로 동률을 정확히 판정한다(0판은 누구와도 동률이고 대결 수 단계에서 뒤로 간다) */
const byRate = (a: TallyRow, b: TallyRow) => b.wins * matches(a) - a.wins * matches(b);
const byMatches = (a: TallyRow, b: TallyRow) => matches(b) - matches(a);
const byChamps = (a: TallyRow, b: TallyRow) => b.championships - a.championships;
/** 코드 단위 오름차순(id는 PK라 같은 값이 없다) */
const byId = (a: TallyRow, b: TallyRow) => (a.id < b.id ? -1 : 1);

function sorted(rows: readonly TallyRow[], order: ((a: TallyRow, b: TallyRow) => number)[]): TallyRow[] {
  return [...rows]
    .sort((a, b) => {
      for (const cmp of order) {
        const c = cmp(a, b);
        if (c !== 0) return c;
      }
      return byId(a, b);
    })
    .slice(0, RANKING_LIMIT);
}

export function rankTally(runs: number, rows: readonly TallyRow[]): Rankings {
  return {
    runs,
    minMatches: MIN_DECIDED_MATCHES,
    byChampionships: sorted(rows.filter((r) => r.championships > 0), [byChamps, byRate, byMatches]),
    byWinRate: sorted(rows.filter((r) => matches(r) >= MIN_DECIDED_MATCHES), [byRate, byMatches, byChamps]),
  };
}
