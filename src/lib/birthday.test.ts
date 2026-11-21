import { describe, expect, it } from 'vitest';
import { BIRTHDAY, daysUntilBirthday, ddayLabel } from './birthday';

describe('daysUntilBirthday', () => {
  it('생일은 3월 21일', () => {
    expect(BIRTHDAY).toEqual({ month: 3, day: 21 });
  });

  it('한국 날짜로 생일 당일이면 0', () => {
    // 2027-03-21 00:30 KST = 03-20 15:30 UTC
    expect(daysUntilBirthday(new Date('2027-03-20T15:30:00Z'))).toBe(0);
    // 2027-03-21 23:59 KST
    expect(daysUntilBirthday(new Date('2027-03-21T14:59:00Z'))).toBe(0);
  });

  it('UTC로는 아직 전날이어도 한국 날짜 기준으로 센다', () => {
    // 2027-03-20 23:00 UTC = 03-21 08:00 KST
    expect(daysUntilBirthday(new Date('2027-03-20T23:00:00Z'))).toBe(0);
    // 2027-03-20 14:00 UTC = 03-20 23:00 KST → 하루 남음
    expect(daysUntilBirthday(new Date('2027-03-20T14:00:00Z'))).toBe(1);
  });

  it('올해 생일이 지났으면 내년 생일까지 센다', () => {
    // 2026-11-21 12:00 KST → 2027-03-21까지 120일
    expect(daysUntilBirthday(new Date('2026-11-21T03:00:00Z'))).toBe(120);
    // 2027-03-22 KST → 2028-03-21(윤년 2월 29일 포함) 365일
    expect(daysUntilBirthday(new Date('2027-03-22T03:00:00Z'))).toBe(365);
  });

  it('다른 날짜도 받을 수 있다', () => {
    expect(daysUntilBirthday(new Date('2026-12-30T03:00:00Z'), { month: 12, day: 31 })).toBe(1);
  });
});

describe('ddayLabel', () => {
  it('당일은 D-DAY, 그 외 D-n', () => {
    expect(ddayLabel(0)).toBe('D-DAY');
    expect(ddayLabel(120)).toBe('D-120');
  });
});
