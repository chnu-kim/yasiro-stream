'use client';
// 연도 목차: 화면 세로 가운데를 지난 마지막 챕터를 지금 챕터로 본다(/about 챕터 목차와 같은 기준).
// 목차로 이동하는 동안은 스크롤 위치로 바꾸지 않는다(지나치는 챕터마다 표시가 깜빡인다).
// 이동은 스크롤만 하고 history를 쌓지 않는다(목록 상태의 정본인 URL과 무관한 위치 이동이다).
import { useCallback, useEffect, useRef, useState } from 'react';

const REDUCE = '(prefers-reduced-motion: reduce)';

export function useChapterSpy(keys: readonly string[]) {
  const [current, setCurrent] = useState<string | null>(keys[0] ?? null);
  const jumping = useRef(false);
  const releaseJump = useRef<() => void>(() => {});
  const keysId = keys.join('|');

  useEffect(() => {
    const list = keysId === '' ? [] : keysId.split('|');
    if (list.length === 0) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (jumping.current) return;
      const vh = window.innerHeight;
      let cur = list[0];
      for (const key of list) {
        const el = document.querySelector<HTMLElement>(`[data-chapter="${CSS.escape(key)}"]`);
        if (el && el.getBoundingClientRect().top <= vh * 0.5) cur = key;
      }
      // 맨 아래까지 내렸으면 마지막 챕터가 가운데에 못 닿아도 마지막으로 본다
      if (window.scrollY + vh >= document.documentElement.scrollHeight - 2) cur = list[list.length - 1];
      setCurrent(cur);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [keysId]);

  useEffect(() => () => releaseJump.current(), []);

  const jump = useCallback((key: string) => {
    const heading = document.querySelector<HTMLElement>(`[data-chapter="${CSS.escape(key)}"] h2`);
    if (!heading) return;
    releaseJump.current();
    jumping.current = true;
    setCurrent(key);
    const release = () => {
      jumping.current = false;
      window.removeEventListener('scrollend', release);
      clearTimeout(timer);
      releaseJump.current = () => {};
    };
    window.addEventListener('scrollend', release);
    const timer = setTimeout(release, 1500); // 이미 그 자리라 스크롤이 일어나지 않으면 scrollend가 오지 않는다
    releaseJump.current = release;
    heading.scrollIntoView({ block: 'start', behavior: window.matchMedia(REDUCE).matches ? 'auto' : 'smooth' });
    heading.focus({ preventScroll: true });
  }, []);

  return { current, jump };
}
