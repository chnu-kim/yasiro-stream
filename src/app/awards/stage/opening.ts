// TEMP(오프닝 방향 비교): 무대와 SetupScreen이 같은 값을 읽는다(three.js를 SetupScreen 번들에 끌어오지 않게 따로 둔다)
/** TEMP(오프닝 방향 비교): now(지금) | ring(링이 무대를 연다) | title(제목 먼저). 최종 화면은 셋 다 같다. 결정 뒤 지운다 */
export const OPENING: 'now' | 'ring' | 'title' = (() => {
  if (typeof window === 'undefined') return 'now';
  try {
    const v = window.localStorage.getItem('stage-open');
    return v === 'ring' || v === 'title' ? v : 'now';
  } catch {
    return 'now';
  }
})();
