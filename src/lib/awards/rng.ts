// 서버 대진 뽑기용 난수(crypto). drawBracket의 rng 계약([0,1))을 지킨다. 서버 deps.rng로만 주입한다.
export type RandomSource = (array: Uint32Array) => Uint32Array;

/** [0,1) 균등. 호출마다 Uint32 두 개 → 53비트: ((a >>> 5) * 2**26 + (b >>> 6)) / 2**53.
 *  shuffle의 Math.floor(r * (i + 1))은 i+1 ≤ 1024에서 치우침이 2^-43 미만이라 거부 샘플링을 하지 않는다 */
export function cryptoRng(source: RandomSource = (a) => crypto.getRandomValues(a)): () => number {
  return () => {
    const [a, b] = source(new Uint32Array(2));
    return ((a >>> 5) * 2 ** 26 + (b >>> 6)) / 2 ** 53;
  };
}
