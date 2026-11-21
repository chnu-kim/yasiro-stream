// 강 선택지·3·4위전 가능 여부. 순수 함수(서버·클라이언트·scripts 공용).
import type { SizeChoice, SizeOption } from "./types.ts";

/** 고를 수 있는 강. 8강은 없다(요구사항). 후보 수에 맞춰 nextPow2(n)까지만 보인다(sizeOptions) */
export const SIZE_LADDER: readonly number[] = [4, 16, 32, 64, 128, 256, 512, 1024];

/** n 이상인 가장 작은 2의 거듭제곱. n<2이면 0 */
export function nextPow2(n: number): number {
  if (n < 2) return 0;
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

/** 강 B로 대진을 짤 수 있는가: n >= 2 && B < 2n. (B >= 2n이면 1라운드가 전부 부전승이거나 부전승끼리 붙는다).
 *  B < 2n은 B <= nextPow2(n)과 같다(2의 거듭제곱 B) */
export function sizeEnabled(size: number, n: number): boolean {
  return n >= 2 && size < 2 * n;
}

/** 보이는 강만, SIZE_LADDER 순서. 후보가 128개 이하면 128강까지, 338개면 512강까지. 후보가 3개 미만이면 빈 배열 */
export function sizeOptions(n: number): SizeOption[] {
  return SIZE_LADDER.filter((size) => sizeEnabled(size, n)).map((size): SizeOption => {
    if (n > size) return { size, fit: "draw", extra: n - size };
    if (n === size) return { size, fit: "exact", extra: 0 };
    return { size, fit: "byes", extra: size - n };
  });
}

/** 기본 선택: 16강이 보이면 16, 아니면 보이는 것 중 가장 큰 강. 보이는 강이 없으면 null */
export function defaultSizeChoice(n: number): SizeChoice | null {
  const sizes = sizeOptions(n).map((o) => o.size);
  return sizes.includes(16) ? 16 : (sizes.at(-1) ?? null);
}

/** 부문을 바꿔 n이 달라졌을 때: 지금 강이 보이면 그대로, 아니면 그보다 작은 것 중 가장 큰 강, 그것도 없으면 기본값 */
export function coerceSizeChoice(choice: SizeChoice | null, n: number): SizeChoice | null {
  const sizes = sizeOptions(n).map((o) => o.size);
  if (choice === null) return defaultSizeChoice(n);
  if (sizes.includes(choice)) return choice;
  return sizes.filter((size) => size < choice).at(-1) ?? defaultSizeChoice(n);
}

/** 3·4위전을 할 수 있는가: 두 준결승이 모두 실제 판일 때.
 *  size >= 8이면 준결승은 1라운드 뒤라 양쪽 모두 게임이 올라온다(1라운드 매치마다 0번 칸은 게임).
 *  size 4는 부전승이 없을 때만(min(n,4) === 4). size 2는 준결승이 없다 */
export function thirdPlaceAvailable(size: number, n: number): boolean {
  return size >= 8 || (size === 4 && Math.min(n, 4) === 4);
}
