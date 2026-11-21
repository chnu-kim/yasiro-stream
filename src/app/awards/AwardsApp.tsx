'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { defaultSizeChoice, coerceSizeChoice } from '@/lib/awards/options';
import { DEFAULT_THIRD_PLACE, defaultDivision, DIVISIONS, divisionEntries } from '@/lib/awards/entries';
import { PAGE_TITLE } from '@/lib/awards/labels';
import { focusHeadingAfter, INITIAL_SCREEN, inProgress, newRun, reduce } from '@/lib/awards/flow';
import type { AwardEntry, Division, SizeChoice } from '@/lib/awards/types';
import MatchScreen from './MatchScreen';
import ResultScreen from './ResultScreen';
import SetupScreen from './SetupScreen';
import styles from './awards.module.css';

// 화면 상태(setup | play | result)는 lib/awards/flow의 리듀서가 정한다. 설정 값은 화면과 따로 들고 있어
// "다시 하기"로 돌아와도 이전 선택이 남는다. Math.random은 여기서만 넘긴다.
export default function AwardsApp({ entries }: { entries: AwardEntry[] }) {
  const [screen, dispatch] = useReducer(reduce, INITIAL_SCREEN);
  const counts = useMemo(
    () => Object.fromEntries(DIVISIONS.map((d) => [d, divisionEntries(entries, d).length])) as Record<Division, number>,
    [entries],
  );
  const [division, setDivision] = useState<Division>(() => defaultDivision(counts));
  const [thirdRequested, setThirdRequested] = useState(DEFAULT_THIRD_PLACE);
  const [sizeChoice, setSizeChoice] = useState<SizeChoice | null>(() => defaultSizeChoice(counts[defaultDivision(counts)]));
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  const changeDivision = (next: Division) => {
    setDivision(next);
    setSizeChoice((cur) => coerceSizeChoice(cur, counts[next]));
  };

  const start = () => {
    const ids = divisionEntries(entries, division).map((e) => e.id);
    if (sizeChoice === null) return; // 시작 버튼이 막혀 있어 오지 않는다
    dispatch({ type: 'start', run: newRun(ids, division, sizeChoice, thirdRequested, Math.random) });
  };

  // 대진 도중 새로고침·닫기 경고(브라우저 기본 문구)
  const guard = inProgress(screen);
  useEffect(() => {
    if (!guard) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [guard]);

  // 누른 요소가 사라지거나 비활성이 되면(화면 전환, 첫 판까지 되돌리기) 그 화면 제목으로 포커스를 옮긴다.
  // 대결 중 고르기는 카드 버튼이 유지돼 포커스가 그대로 남는다. 규칙은 lib/awards/flow focusHeadingAfter.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevScreen = useRef(screen);
  useEffect(() => {
    if (focusHeadingAfter(prevScreen.current, screen)) headingRef.current?.focus();
    prevScreen.current = screen;
  }, [screen]);

  if (screen.kind === 'setup') {
    return (
      <SetupScreen
        division={division}
        counts={counts}
        sizeChoice={sizeChoice}
        thirdRequested={thirdRequested}
        headingRef={headingRef}
        onDivision={changeDivision}
        onSize={setSizeChoice}
        onThird={setThirdRequested}
        onStart={start}
      />
    );
  }
  if (screen.kind === 'play') {
    return (
      <MatchScreen
        run={screen.run}
        byId={byId}
        headingRef={headingRef}
        onPick={(winnerId, expectedIndex) => dispatch({ type: 'pick', winnerId, expectedIndex })}
        onUndo={() => dispatch({ type: 'undo' })}
        onRestart={() => dispatch({ type: 'restart' })}
      />
    );
  }
  return (
    <>
      <h1 className={styles.srOnly}>{PAGE_TITLE}</h1>
      <ResultScreen run={screen.run} byId={byId} headingRef={headingRef} onRestart={() => dispatch({ type: 'restart' })} />
    </>
  );
}
