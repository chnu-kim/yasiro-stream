import { useEffect, useRef, useState, type Ref } from 'react';
import { FastForward, Pause, Play } from 'lucide-react';
import Link from 'next/link';
import Button from '@/components/Button';
import { DIVISIONS, DIVISION_LABEL, divisionAvailable, rankingsHref } from '@/lib/awards/entries';
import { DRAW_LOADING_TEXT } from '@/lib/awards/client';
import {
  CEREMONY_EYEBROW,
  ceremonyLines,
  fitText,
  JUDGE_SEAT_LABEL,
  JUDGE_TITLE,
  PAGE_TITLE,
  RESULTS_LINK_LABEL,
  SETTINGS_LABEL,
  settingsSummary,
  sizeLabel,
  START_LABEL,
  thirdPlaceNote,
} from '@/lib/awards/labels';
import { sizeOptions, thirdPlaceAvailable } from '@/lib/awards/options';
import type { AwardEntry, Division, SizeChoice } from '@/lib/awards/types';
import AwardsStage from './AwardsStage';
import OpeningLab from './OpeningLab'; // TEMP(오프닝 결정 비교)
import type { StageIntro } from './stage/createStage';
import styles from './awards.module.css';

// 입장 화면: 시상식장에 들어와 심사위원으로 위촉되는 흐름. 화면 전체가 3D 무대(AwardsStage)이고,
// 조명이 켜지면 제목 → 자막 세 줄(올해 후보 수 → 단 한 편 → 당신이 고른다) → "심사 시작하기" 버튼 하나가 차례로 나온다.
// 부문·대진·3·4위전은 기본값으로 골라 두고, "심사 방식 바꾸기"를 누르면 심사위원 위촉장 모달(<dialog>)에서 바꾼다.
// 두 번째 방문부터는 짧은 연출(SEEN_KEY), 동작 줄이기면 완성된 장면. 연출 중 아무 곳이나 누르거나 키를 누르면 건너뛴다.
// 시작하면 카메라가 고리 안으로 날아들고(launching) 화면이 암전된 뒤 대결 화면이 열린다(대진 요청은 AwardsApp이 함께 보낸다).
const SEEN_KEY = 'yasiro-awards-intro-seen';

/** 연출 방식별 자막·버튼 시각(초, 무대 시계 출발 기준). 무대 시간표(stage/createStage STAGE_TIMELINES)와 맞물린다:
 *  제목 = title(6.8), 자막 한 줄은 그 뒤(7.8). captions[i] = i번째 줄이 나오는 시각, 마지막 줄은 남는다. 시간값은 판단 시작값 */
const CUES: Record<StageIntro, { title: number; captions: number[]; cta: number }> = {
  full: { title: 6.8, captions: [7.8], cta: 8.8 },
  short: { title: 1.8, captions: [2.2], cta: 2.8 },
  none: { title: 0, captions: [0], cta: 0 },
};

export default function SetupScreen({
  division,
  counts,
  nominees,
  sizeChoice,
  thirdRequested,
  headingRef,
  onDivision,
  onSize,
  onThird,
  drawing,
  drawError,
  onStart,
}: {
  division: Division;
  counts: Record<Division, number>;
  /** 무대에 올릴 후보(2026년에 한 게임). 자막의 후보 수도 이 값 */
  nominees: readonly AwardEntry[];
  sizeChoice: SizeChoice | null;
  thirdRequested: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  onDivision: (d: Division) => void;
  onSize: (c: SizeChoice) => void;
  onThird: (on: boolean) => void;
  /** 대진을 뽑는 요청이 진행 중(= 무대 출발 연출 중) */
  drawing: boolean;
  /** 뽑기 실패 문구. 없으면 null */
  drawError: string | null;
  onStart: () => void;
}) {
  const n = counts[division];
  const options = sizeOptions(n);
  const selected = options.find((o) => o.size === sizeChoice);
  const note = selected === undefined ? null : thirdPlaceNote(selected.size, n);
  const canThird = selected !== undefined && thirdPlaceAvailable(selected.size, n);
  const canStart = divisionAvailable(n) && selected !== undefined && !drawing;
  const lines = ceremonyLines(nominees.length);

  // 연출 방식은 처음 한 번 정한다
  const [intro] = useState<StageIntro>(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'none';
    try {
      return window.localStorage.getItem(SEEN_KEY) === '1' ? 'short' : 'full';
    } catch {
      return 'full';
    }
  });
  const cues = CUES[intro];

  // 무대 시계가 출발한 뒤 경과 시간(초)을 큐 단위로 올린다. 건너뛰면 끝 시각으로
  const [elapsed, setElapsed] = useState(-1);
  const [skipKey, setSkipKey] = useState(0);
  const startedAt = useRef<number | null>(null);
  const frozenRef = useRef(false); // TEMP(스토리보드)
  const onReady = () => {
    if (startedAt.current !== null) return;
    startedAt.current = performance.now();
    // TEMP(스토리보드): 개발 중 localStorage['stage-t']가 있으면 자막·버튼도 그 시각 상태로 멈춘다. 커밋 전 제거
    const frozen = process.env.NODE_ENV !== 'production' ? window.localStorage.getItem('stage-t') : null;
    if (frozen !== null) {
      frozenRef.current = true;
      startedAt.current = performance.now() - Number(frozen) * 1000;
      setElapsed(Number(frozen));
      return;
    }
    setElapsed(0);
  };
  useEffect(() => {
    if (elapsed < 0 || elapsed >= cues.cta || frozenRef.current) return;
    const next = [cues.title, ...cues.captions, cues.cta].filter((c) => c > elapsed).sort((a, b) => a - b)[0];
    const wait = Math.max(0, next * 1000 - (performance.now() - (startedAt.current ?? 0)));
    const t = window.setTimeout(() => setElapsed(next), wait);
    return () => window.clearTimeout(t);
  }, [elapsed, cues]);

  const finished = elapsed >= cues.cta;
  useEffect(() => {
    if (!finished) return;
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // 저장 못 하면 다음에도 긴 연출이다
    }
  }, [finished]);

  const skip = () => {
    if (finished) return;
    setElapsed(cues.cta);
    setSkipKey((k) => k + 1);
  };
  // 대기 움직임 멈춤(WCAG 2.2.2: 5초 넘게 저절로 움직이는 것은 멈출 수 있어야 한다)
  const [paused, setPaused] = useState(false);
  const skipRef = useRef(skip);
  useEffect(() => {
    skipRef.current = skip;
  });
  useEffect(() => {
    if (finished || elapsed < 0) return;
    const onKey = () => skipRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finished, elapsed]);
  // 진행 중에 동작 줄이기가 켜지면 연출을 바로 끝낸다
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => {
      if (mq.matches) skipRef.current();
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // 지금 보이는 자막 줄: 나온 시각이 가장 늦은 줄. 앞의 두 줄은 다음 줄이 나오면 사라진다
  const captionIndex = cues.captions.reduce((acc, at, i) => (at >= 0 && elapsed >= at ? i : acc), -1);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const openSettings = () => dialogRef.current?.showModal();
  const closeSettings = () => dialogRef.current?.close();

  return (
    <section
      className={styles.ceremony}
      data-launch={drawing || undefined}
      data-ceremony=""
      data-playing={(!finished && !drawing) || undefined}
      data-finished={finished || undefined}
      onPointerDown={finished ? undefined : skip}
    >
      <AwardsStage entries={nominees} intro={intro} launching={drawing} skipKey={skipKey} paused={paused} onReady={onReady} />
      {process.env.NODE_ENV !== 'production' && <OpeningLab />}

      {/* 준비 박자: 포스터를 읽고 셰이더를 예열하는 동안(무대 시계 출발 전) 검은 화면 대신 "곧 시작된다"를 보인다 */}
      <div className={styles.preparing} data-hide={elapsed >= 0 || undefined} aria-hidden="true">
        <p className={styles.kicker}>{CEREMONY_EYEBROW}</p>
        <span className={styles.preparingLine} />
      </div>

      {/* 처음부터 보이는 조작: 연출 중에는 건너뛰기, 끝나면 대기 움직임 멈춤·재생 */}
      <button
        type="button"
        className={styles.stageControl}
        aria-label={finished ? (paused ? '움직임 재생' : '움직임 멈춤') : '연출 건너뛰기'}
        title={finished ? (paused ? '움직임 재생' : '움직임 멈춤') : '연출 건너뛰기'}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => (finished ? setPaused((p) => !p) : skip())}
      >
        {finished ? paused ? <Play size={18} strokeWidth={1.8} aria-hidden="true" /> : <Pause size={18} strokeWidth={1.8} aria-hidden="true" /> : <FastForward size={18} strokeWidth={1.8} aria-hidden="true" />}
      </button>

      <header className={styles.ceremonyTop} data-show={elapsed >= cues.title || undefined}>
        <p className={styles.kicker}>{CEREMONY_EYEBROW}</p>
        {/* 금박 제목: 그림자는 따로 깐 복제 글자(배경을 글자로 자른 금박에 그림자를 직접 걸면 탁해진다) */}
        <h1 ref={headingRef} tabIndex={-1} className={styles.ceremonyTitle}>
          <span className={styles.titleShade} aria-hidden="true">
            {PAGE_TITLE}
          </span>
          <span className={styles.titleFill}>{PAGE_TITLE}</span>
        </h1>
      </header>

      <div className={styles.ceremonyBottom}>
        {/* 자막은 보이는 연출용(aria-hidden). 스크린리더에는 세 줄을 한 번에 읽힌다 */}
        <p className={styles.srOnly}>{lines.map(([a, b]) => a + b).join(' ')}</p>
        <p className={styles.caption} aria-hidden="true">
          {captionIndex >= 0 && (
            <span key={captionIndex} className={styles.captionLine} data-stay={captionIndex === lines.length - 1 || undefined}>
              {lines[captionIndex][0]}
              {lines[captionIndex][1] !== '' && <strong className={styles.captionStrong}>{lines[captionIndex][1]}</strong>}
            </span>
          )}
        </p>

        <div className={styles.cta} data-show={finished || undefined} inert={!finished}>
          <p className={styles.kicker}>{JUDGE_SEAT_LABEL}</p>
          <Button variant="primary" size="lg" className={styles.ctaButton} disabled={!canStart} onClick={onStart}>
            {drawing ? DRAW_LOADING_TEXT : START_LABEL}
          </Button>
          <p className={styles.ctaSummary}>{settingsSummary(DIVISION_LABEL[division], selected, thirdRequested && canThird)}</p>
          <p className={styles.ctaLinks}>
            <button type="button" className={styles.textLink} onClick={openSettings}>
              {SETTINGS_LABEL}
            </button>
            <span aria-hidden="true">·</span>
            <Link href={rankingsHref(division)} className={styles.textLink}>
              {RESULTS_LINK_LABEL}
            </Link>
          </p>
          {drawError !== null && (
            <p role="alert" className={styles.note}>
              {drawError}
            </p>
          )}
        </div>
      </div>

      {/* 영화 같은 화면: 비네트·필름 그레인, 연출 중에는 위아래 레터박스(버튼이 나오면 걷힌다) */}
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.letterbox} aria-hidden="true" />

      {/* 심사 시작: 카메라가 헤일로 안으로 날아드는 동안 화면이 어두워진다 */}
      <div className={styles.curtain} aria-hidden="true" />

      <dialog
        ref={dialogRef}
        className={styles.judgeDialog}
        aria-labelledby="judge-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeSettings();
        }}
      >
        <div className={styles.judgeCard}>
          <p className={styles.kicker}>Judge</p>
          <h2 id="judge-title" className={styles.judgeTitle}>
            {JUDGE_TITLE}
          </h2>
          <span className={styles.ornament} aria-hidden="true">
            <span className={styles.ornamentGem} />
          </span>

          <fieldset className={styles.row}>
            <legend className={styles.legend}>부문</legend>
            <div className={styles.choices}>
              {DIVISIONS.map((d) => {
                const available = divisionAvailable(counts[d]);
                return (
                  <label key={d} className={styles.choice}>
                    <input
                      type="radio"
                      name="division"
                      value={d}
                      checked={division === d}
                      disabled={!available}
                      aria-describedby={available ? undefined : 'division-note'}
                      onChange={() => onDivision(d)}
                    />
                    <span className={styles.choiceText}>{DIVISION_LABEL[d]}</span>
                    <span className={styles.count}>
                      <span className={styles.num}>{counts[d]}</span>개
                    </span>
                  </label>
                );
              })}
            </div>
            {DIVISIONS.some((d) => !divisionAvailable(counts[d])) && (
              <p id="division-note" className={styles.note}>
                후보가 3개 이상이어야 해요.
              </p>
            )}
          </fieldset>

          <fieldset className={styles.row}>
            <legend className={styles.legend}>대진</legend>
            <div className={styles.choices}>
              {options.map((o) => (
                <label key={o.size} className={styles.choice}>
                  <input
                    type="radio"
                    name="size"
                    value={String(o.size)}
                    checked={sizeChoice === o.size}
                    aria-describedby="size-fit"
                    onChange={() => onSize(o.size)}
                  />
                  <span className={styles.choiceText}>{sizeLabel(o)}</span>
                </label>
              ))}
            </div>
            {selected !== undefined && (
              <p id="size-fit" className={styles.note} aria-live="polite">
                {fitText(selected, n)}
              </p>
            )}
          </fieldset>

          <div className={styles.row}>
            <label className={styles.choice}>
              <input
                type="checkbox"
                checked={thirdRequested && canThird}
                disabled={!canThird}
                aria-describedby={note === null ? undefined : 'third-note'}
                onChange={(e) => onThird(e.target.checked)}
              />
              <span className={styles.choiceText}>3·4위전 하기</span>
            </label>
            {note !== null && (
              <p id="third-note" className={styles.note}>
                {note}
              </p>
            )}
          </div>

          <div className={styles.actions}>
            <Button variant="primary" size="lg" onClick={closeSettings}>
              확인
            </Button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
