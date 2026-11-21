// 야시로 생일(3월 21일)까지 남은 날. 한국 시간(UTC+9, 서머타임 없음) 날짜로 센다.
export const BIRTHDAY = { month: 3, day: 21 } as const;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// now 시각의 한국 날짜에서 다음 생일까지 남은 날. 생일 당일이면 0.
export function daysUntilBirthday(now: Date, birthday: { month: number; day: number } = BIRTHDAY): number {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const today = Date.UTC(y, kst.getUTCMonth(), kst.getUTCDate());
  let next = Date.UTC(y, birthday.month - 1, birthday.day);
  if (next < today) next = Date.UTC(y + 1, birthday.month - 1, birthday.day);
  return Math.round((next - today) / DAY_MS);
}

// 화면 표기: 당일은 D-DAY, 그 외 D-n
export function ddayLabel(days: number): string {
  return days === 0 ? 'D-DAY' : `D-${days}`;
}
