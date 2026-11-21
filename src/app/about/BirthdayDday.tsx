'use client';
// 생일 값 아래 D-day 배지. 날짜는 방문 시점에 정해지므로 서버 HTML에는 넣지 않고(캐시된 페이지가 낡지 않게) 브라우저에서만 그린다.
import { useSyncExternalStore } from 'react';
import { daysUntilBirthday, ddayLabel } from '@/lib/birthday';
import styles from './page.module.css';

const subscribe = () => () => {};
const getDays = () => daysUntilBirthday(new Date());
const getServerDays = () => null;

export default function BirthdayDday() {
  const days = useSyncExternalStore(subscribe, getDays, getServerDays);
  if (days === null) return null;
  return (
    <span className={days === 0 ? `${styles.dday} ${styles.ddayToday}` : styles.dday}>
      <span className={styles.srOnly}>생일까지 </span>
      {ddayLabel(days)}
    </span>
  );
}
