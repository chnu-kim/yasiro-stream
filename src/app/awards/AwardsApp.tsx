'use client';

import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { defaultSizeChoice, coerceSizeChoice } from '@/lib/awards/options';
import { DEFAULT_THIRD_PLACE, defaultDivision, DIVISIONS, divisionEntries } from '@/lib/awards/entries';
import { PAGE_TITLE } from '@/lib/awards/labels';
import { canRetrySubmit, classifyDraw, classifySubmit, drawFailureMessage, type DrawFailure, type SubmitStatus } from '@/lib/awards/client';
import { focusHeadingAfter, INITIAL_SCREEN, reduce } from '@/lib/awards/flow';
import { restoreRun, SAVED_RUN_KEY, serializeRun, type RestoredRun } from '@/lib/awards/resume';
import type { AwardEntry, Division, SizeChoice } from '@/lib/awards/types';
import { awardsApi } from './awardsApi';
import MatchScreen from './MatchScreen';
import ResultScreen from './ResultScreen';
import SetupScreen from './SetupScreen';
import styles from './awards.module.css';

// 화면 상태(setup | play | result)는 lib/awards/flow의 리듀서가 정한다. 설정 값은 화면과 따로 들고 있어
// "다시 하기"로 돌아와도 이전 선택이 남는다. 대진은 서버가 뽑아 서명해 주고(/api/awards/draw),
// 결과 화면에 들어가면 그 판을 자동으로 제출한다(/api/awards/submit). 집계 순위는 따로 된 페이지(/awards/rankings)다.
// 진행 중인 대진(token + picks)은 localStorage에 저장해 새로고침해도 이어 한다(검증은 lib/awards/resume restoreRun).
// 제출이 끝나거나(재시도할 수 없는 실패 포함) 처음으로 돌아가면 지운다.
const noopSubscribe = () => () => {};

// 저장된 대진은 브라우저에만 있어 서버 렌더와 첫 화면이 달라질 수 있다. 하이드레이션이 끝난 뒤에만 AwardsGame을
// 그리고, AwardsGame은 첫 렌더에서 localStorage를 읽어 바로 이어 할 화면으로 시작한다(설정 화면이 깜빡이지 않게).
export default function AwardsApp({ entries }: { entries: AwardEntry[] }) {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!hydrated) return <div className={styles.wrap} aria-busy="true" />;
  return <AwardsGame entries={entries} />;
}

function AwardsGame({ entries }: { entries: AwardEntry[] }) {
  const [restored] = useState<RestoredRun | null>(() =>
    restoreRun(readSaved(), new Set(entries.map((e) => e.id)), Math.floor(Date.now() / 1000)),
  );
  const [screen, dispatch] = useReducer(reduce, INITIAL_SCREEN, (init) =>
    restored === null ? init : reduce(init, { type: 'resume', run: restored.run, token: restored.token }),
  );
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

  // 진행 중이면 고를 때마다, 결과 화면은 제출이 끝날 때까지 저장한다. 설정 화면이면(이어 할 수 없던 저장본 포함) 지운다
  const resumedToken = useRef<string | null>(restored?.token ?? null);
  const submittedToken = useRef<string | null>(null);
  useEffect(() => {
    if (screen.kind === 'setup') writeSaved(null);
    else if (screen.kind === 'play' || submittedToken.current !== screen.token) writeSaved(serializeRun(screen.run, screen.token));
  }, [screen]);

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
  const send = (run: { picks: string[]; division: Division }, token: string, retried: boolean) => {
    submittedToken.current = token;
    setSubmit({ kind: 'sending', retried });
    awardsApi.submit(run.division, token, run.picks).then((res) => {
      if (submittedToken.current !== token) return;
      const status = classifySubmit(res.status, retried);
      setSubmit(status);
      // 결과가 정해졌으면(재시도 버튼이 없는 상태) 저장본을 지운다. 새로고침하면 설정 화면이다
      if (status.kind !== 'sending' && !canRetrySubmit(status)) writeSaved(null);
    });
  };
  useEffect(() => {
    // 새로고침으로 되살린 결과 화면은 앞서 제출이 끊겼을 수 있어 재시도로 보낸다(409면 이미 반영됨)
    if (screen.kind === 'result' && submittedToken.current !== screen.token) send(screen.run, screen.token, resumedToken.current === screen.token);
    // screen이 result로 바뀔 때 한 번만 보낸다(같은 token은 ref가 막는다)
  }, [screen]);

  const restart = () => {
    submittedToken.current = null;
    setSubmit(null);
    dispatch({ type: 'restart' });
  };

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

// localStorage는 막혀 있거나(사생활 보호 모드 등) 가득 찰 수 있다. 실패하면 이어 하기만 안 될 뿐 진행은 그대로다
function readSaved(): string | null {
  try {
    return window.localStorage.getItem(SAVED_RUN_KEY);
  } catch {
    return null;
  }
}
function writeSaved(value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(SAVED_RUN_KEY);
    else window.localStorage.setItem(SAVED_RUN_KEY, value);
  } catch {
    // 저장 실패는 무시한다
  }
}
