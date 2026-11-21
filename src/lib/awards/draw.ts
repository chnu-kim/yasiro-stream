// 대진 뽑기. 난수는 주입(rng: () => number, 계약 [0,1))한다. Math.random·DOM에 의존하지 않아 서버(PR3)에서 같은 rng로 다시 뽑을 수 있다.
import { sizeEnabled } from "./options.ts";
import type { Bracket } from "./types.ts";

function isPow2(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;
}

/** Fisher–Yates. 새 배열을 반환하고 입력은 건드리지 않는다. rng 호출 횟수 = max(0, len−1).
 *  i = len−1 … 1: j = Math.min(i, Math.floor(rng() * (i + 1))); swap(i, j)
 *  1 이상(계약 위반)은 Math.min으로 clamp, 음수·NaN은 RangeError */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const r = rng();
    if (!(r >= 0)) throw new RangeError(`rng must return a value in [0, 1), got ${r}`);
    const j = Math.min(i, Math.floor(r * (i + 1)));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** bit-reversal 순열의 앞 count개 = 부전승 매치 번호(그 순서 그대로). matches는 2의 거듭제곱(1 이상), 0 <= count < matches.
 *  양쪽 절반·사분면의 부전승 수 차이가 1 이하가 된다 */
export function byeMatches(matches: number, count: number): number[] {
  if (!isPow2(matches)) throw new RangeError(`matches must be a power of two, got ${matches}`);
  if (!Number.isInteger(count) || count < 0 || count >= matches) {
    throw new RangeError(`count must be an integer in [0, ${matches}), got ${count}`);
  }
  const bits = Math.log2(matches);
  const out: number[] = [];
  for (let j = 0; j < count; j++) {
    let rev = 0;
    for (let b = 0; b < bits; b++) rev |= ((j >> b) & 1) << (bits - 1 - b);
    out.push(rev);
  }
  return out;
}

/** 코드 단위 오름차순(localeCompare가 아니다: 환경마다 같은 결과).
 *  ids는 중복 검사를 통과한 뒤에만 정렬하므로 a === b인 경우가 없다(0을 돌려줄 일이 없다) */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : 1;
}

/** 대진 뽑기.
 *  1) ids를 코드 단위 오름차순으로 정렬(입력 순서와 무관하게 같은 rng → 같은 대진. PR3 재현용)
 *  2) shuffle(sorted, rng)
 *  3) entrants = 앞 min(n, size)개
 *  4) byes = size − entrants.length, byeSet = byeMatches(size/2, byes)
 *  5) 매치 i = 0..size/2−1: byeSet에 있으면 [다음 entrant, null], 아니면 [다음 entrant, 다음 entrant]
 *  던지는 경우(RangeError): size가 2의 거듭제곱(>=2)이 아님, ids 중복, !sizeEnabled(size, n) */
export function drawBracket(ids: readonly string[], size: number, rng: () => number): Bracket {
  if (!isPow2(size) || size < 2) throw new RangeError(`size must be a power of two >= 2, got ${size}`);
  if (new Set(ids).size !== ids.length) throw new RangeError("ids must be unique");
  if (!sizeEnabled(size, ids.length)) throw new RangeError(`size ${size} is not available for ${ids.length} candidates`);
  const sorted = [...ids].sort(compareCodeUnits);
  const entrants = shuffle(sorted, rng).slice(0, size);
  const byeSet = new Set(byeMatches(size / 2, size - entrants.length));
  const slots: (string | null)[] = [];
  let next = 0;
  for (let i = 0; i < size / 2; i++) {
    slots.push(entrants[next++]);
    slots.push(byeSet.has(i) ? null : entrants[next++]);
  }
  return { size, slots };
}
