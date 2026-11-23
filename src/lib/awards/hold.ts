// 대결 카드 실수 방지 규칙(순수). 카드를 HOLD_MS 동안 누르고 있어야 고른다(손을 떼면 취소).
// 새 판이 뜬 직후 ARM_MS 동안은 누르기를 받지 않는다(앞 판에서 이어진 연타가 다음 판을 고르지 않게).
// 타이머·포인터 이벤트는 src/app/awards/AwardCard.tsx가 맡는다.

/** 꾹 누르는 시간. 판이 많아(512강 511판) 길게 잡지 않는다 */
export const HOLD_MS = 600;
/** 새 판이 뜬 뒤 입력을 받지 않는 시간 */
export const ARM_MS = 400;

/** 판이 뜬 시각(shownAt) 이후 누르기를 받을 수 있는가 */
export function armed(shownAt: number, now: number): boolean {
  return now - shownAt >= ARM_MS;
}

/** 꾹 누르기를 시작하는 키(Enter·Space). 누르고 있는 동안 반복되는 keydown은 새 시작이 아니다 */
export function isHoldKey(key: string, repeat: boolean): boolean {
  return !repeat && (key === "Enter" || key === " ");
}
