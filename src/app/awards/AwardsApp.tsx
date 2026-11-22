'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { defaultSizeChoice, coerceSizeChoice } from '@/lib/awards/options';
import { DEFAULT_THIRD_PLACE, defaultDivision, DIVISIONS, divisionEntries } from '@/lib/awards/entries';
import { PAGE_TITLE } from '@/lib/awards/labels';
import { classifyDraw, classifySubmit, drawFailureMessage, type DrawFailure, type SubmitStatus } from '@/lib/awards/client';
import { focusHeadingAfter, INITIAL_SCREEN, inProgress, reduce } from '@/lib/awards/flow';
import type { AwardEntry, Division, SizeChoice } from '@/lib/awards/types';
import { awardsApi } from './awardsApi';
import MatchScreen from './MatchScreen';
import ResultScreen from './ResultScreen';
import SetupScreen from './SetupScreen';
import styles from './awards.module.css';

// 화면 상태(setup | play | result)는 lib/awards/flow의 리듀서가 정한다. 설정 값은 화면과 따로 들고 있어
// "다시 하기"로 돌아와도 이전 선택이 남는다. 대진은 서버가 뽑아 서명해 주고(/api/awards/draw),
// 결과 화면에 들어가면 그 판을 자동으로 제출한다(/api/awards/submit). 집계 순위는 따로 된 페이지(/awards/rankings)다.
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

  const [draw, setDraw] = useState<{ kind: 'idle' } | { kind: 'loading' } | { kind: 'failed'; reason: DrawFailure }>({ kind: 'idle' });
  const drawing = useRef(false);

  const start = async () => {
    if (sizeChoice === null || drawing.current) return; // 시작 버튼이 막혀 있어 오지 않는다
    drawing.current = true;
    setDraw({ kind: 'loading' });
    const res = await awardsApi.draw(division, sizeChoice, thirdRequested);
    drawing.current = false;
    const outcome = classifyDraw(res.status, res.body, new Set(byId.keys()));
    if (outcome.ok) {
      setDraw({ kind: 'idle' });
      dispatch({ type: 'start', run: outcome.run, token: outcome.token });
    } else {
      setDraw({ kind: 'failed', reason: outcome.reason });
    }
  };

  // 결과 화면에 들어가면 그 판을 한 번 제출한다. 같은 token은 ref로 막는다(개발 모드의 effect 두 번 실행이
  // 가짜 409로 성공 문구를 덮어쓰지 않게). 응답이 늦게 와도 지금 token의 것만 반영한다.
  const [submit, setSubmit] = useState<SubmitStatus | null>(null);
  const submittedToken = useRef<string | null>(null);
  const send = (run: { picks: string[]; division: Division }, token: string, retried: boolean) => {
    submittedToken.current = token;
    setSubmit({ kind: 'sending', retried });
    awardsApi.submit(run.division, token, run.picks).then((res) => {
      if (submittedToken.current === token) setSubmit(classifySubmit(res.status, retried));
    });
  };
  useEffect(() => {
    if (screen.kind === 'result' && submittedToken.current !== screen.token) send(screen.run, screen.token, false);
    // screen이 result로 바뀔 때 한 번만 보낸다(같은 token은 ref가 막는다)
  }, [screen]);

  const restart = () => {
    submittedToken.current = null;
    setSubmit(null);
    dispatch({ type: 'restart' });
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
        drawing={draw.kind === 'loading'}
        drawError={draw.kind === 'failed' ? drawFailureMessage(draw.reason) : null}
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
        onRestart={restart}
      />
    );
  }
  return (
    <>
      <h1 className={styles.srOnly}>{PAGE_TITLE}</h1>
      <ResultScreen
        run={screen.run}
        byId={byId}
        headingRef={headingRef}
        submit={submit}
        onRetry={() => send(screen.run, screen.token, true)}
        onRestart={restart}
      />
    </>
  );
}
