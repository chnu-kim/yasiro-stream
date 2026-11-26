import { useEffect, useRef, useState, type Ref } from 'react';
import Button from '@/components/Button';
import KkulMark from '@/components/KkulMark';
import { DIVISION_LABEL, rankingsHref } from '@/lib/awards/entries';
import { DIVISION_AWARD, placementLabel, resultSummary } from '@/lib/awards/labels';
import { placements, totalMatches } from '@/lib/awards/tournament';
import type { AwardEntry, TournamentState } from '@/lib/awards/types';
import { canRetrySubmit, submitStatusText, type SubmitStatus } from '@/lib/awards/client';
import Poster from '../games/Poster';
import GoldConfetti from './GoldConfetti';
import GoldenKkul from './GoldenKkul';
import RankThumb from './RankThumb';
import styles from './awards.module.css';

// 결과 화면: "AND THE WINNER IS…" + 금박 봉투. 봉투를 누르면 뚜껑이 젖혀지고 우승작이 금 액자로 나오며 금가루가 흩날린다.
// 그 뒤 나머지 순위 기록지 행 + 집계 제출 상태 한 줄. 제출은 봉투와 상관없이 화면에 들어오면 AwardsApp이 보낸다.
// 봉투 상태: closed → opening(뚜껑 애니메이션) → open. 봉투 버튼이 사라지면 우승 영역으로 포커스를 옮긴다.
const OPEN_FALLBACK_MS = 1400;

export default function ResultScreen({
  run,
  byId,
  headingRef,
  submit,
  onRetry,
  onRestart,
}: {
  run: TournamentState;
  byId: ReadonlyMap<string, AwardEntry>;
  headingRef: Ref<HTMLHeadingElement>;
  submit: SubmitStatus | null;
  onRetry: () => void;
  onRestart: () => void;
}) {
  const list = placements(run)!;
  const [champion, ...rest] = list;
  const winner = byId.get(champion.id)!;

  const [envelope, setEnvelope] = useState<'closed' | 'opening' | 'open'>('closed');
  const championRef = useRef<HTMLElement>(null);
  // 봉투 opacity 전환이 끝나면 연다. transitionend가 오지 않는 경우(탭 숨김 등)를 위해 시간 상한을 둔다
  useEffect(() => {
    if (envelope !== 'opening') return;
    const t = window.setTimeout(() => setEnvelope('open'), OPEN_FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, [envelope]);
  useEffect(() => {
    if (envelope === 'open') championRef.current?.focus();
  }, [envelope]);

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <GoldenKkul height={96} className={styles.statue} />
        {/* 시상식 패러디 문구는 보이기만 하고, 제목 이름은 "결과"다 */}
        <h2 ref={headingRef} tabIndex={-1} className={`${styles.kicker} ${styles.winnerIs}`}>
          <span aria-hidden="true">And the winner is…</span>
          <span className={styles.srOnly}>결과</span>
        </h2>
        <span className={styles.ornament} aria-hidden="true">
          <span className={styles.ornamentGem} />
        </span>
        <p className={styles.lead}>{resultSummary(DIVISION_LABEL[run.division], run.bracket.size, totalMatches(run))}</p>
      </header>

      {envelope !== 'open' ? (
        <div className={styles.envelopeWrap}>
          <button
            type="button"
            className={styles.envelope}
            data-opening={envelope === 'opening' || undefined}
            disabled={envelope === 'opening'}
            onClick={() => setEnvelope('opening')}
            onTransitionEnd={(e) => {
              if (e.target === e.currentTarget && e.propertyName === 'opacity' && envelope === 'opening') setEnvelope('open');
            }}
          >
            <span className={styles.envBody} aria-hidden="true">
              <span className={styles.envFlap} />
              <span className={styles.envSeal}>
                <KkulMark size={30} />
              </span>
              <span className={styles.envAward}>{DIVISION_AWARD[run.division]}</span>
            </span>
            <span className={styles.srOnly}>봉투 열기</span>
          </button>
          <p className={styles.envHint} aria-hidden="true">
            봉투를 눌러 열어요
          </p>
        </div>
      ) : (
        <>
          <GoldConfetti />
          <section
            ref={championRef}
            tabIndex={-1}
            className={`${styles.champion} ${styles.reveal}`}
            aria-label={placementLabel('champion')}
            style={{ outline: 'none' }}
          >
            <div className={styles.championCover}>
              <Poster game={winner} eager showNo={false} stamp={false} stampTopWhenEmpty />
            </div>
            <div className={styles.championText}>
              <p className={styles.championAward}>{DIVISION_AWARD[run.division]}</p>
              <p className={styles.rankLabel}>{placementLabel('champion')}</p>
              <p className={styles.championName}>{winner.name}</p>
            </div>
          </section>

          <div className={styles.revealLate}>
            <ol className={styles.rankList}>
              {rest.map((pl) => {
                const e = byId.get(pl.id)!;
                return (
                  <li key={pl.id} className={styles.rankRow}>
                    <RankThumb entry={e} />
                    <span className={styles.rankText}>
                      <span className={styles.rankLabel}>{placementLabel(pl.rank)}</span>
                      <span className={styles.rankName}>{e.name}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}

      {/* 제출 상태 줄과 버튼은 발표(봉투 열기)가 끝난 뒤에 보인다. 상태 줄은 늘 그려 두어 aria-live가 나타날 때 읽는다 */}
      <p className={styles.note} aria-live="polite" style={{ marginTop: 'var(--space-5)' }}>
        {envelope !== 'open' || submit === null ? '' : submitStatusText(submit)}
      </p>
      {envelope === 'open' && (
        <div className={styles.actions}>
          {submit !== null && canRetrySubmit(submit) && (
            <Button variant="secondary" size="lg" onClick={onRetry}>
              다시 보내기
            </Button>
          )}
          <Button variant="primary" size="lg" onClick={onRestart}>
            다시 하기
          </Button>
          {submit?.kind === 'done' && (
            <Button href={rankingsHref(run.division)} variant="secondary" size="lg">
              순위 보기
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
