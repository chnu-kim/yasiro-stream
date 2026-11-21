import type { Ref } from 'react';
import Button from '@/components/Button';
import SectionLabel from '@/components/SectionLabel';
import TapeStrip from '@/components/TapeStrip';
import { DIVISION_LABEL } from '@/lib/awards/entries';
import { placementLabel, resultSummary } from '@/lib/awards/labels';
import { placements, totalMatches } from '@/lib/awards/tournament';
import type { AwardEntry, TournamentState } from '@/lib/awards/types';
import { canRetrySubmit, submitStatusText, type SubmitStatus } from '@/lib/awards/client';
import Poster from '../games/Poster';
import RankThumb from './RankThumb';
import styles from './awards.module.css';

// 결과 화면: 우승 큰 카드 + 나머지 순위 기록지 행 + 집계 제출 상태 한 줄.
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

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <SectionLabel>RESULT</SectionLabel>
        <h2 ref={headingRef} tabIndex={-1} className={styles.title}>
          결과
        </h2>
        <p className={styles.lead}>{resultSummary(DIVISION_LABEL[run.division], run.bracket.size, totalMatches(run))}</p>
      </header>

      <section className={styles.champion} aria-label={placementLabel('champion')}>
        <div className={styles.championCover}>
          <TapeStrip rotate={-3} style={{ position: 'absolute', top: -10, left: '50%', marginLeft: -36, zIndex: 1 }} />
          <Poster game={winner} eager showNo={false} stamp={false} stampTopWhenEmpty />
        </div>
        <div className={styles.championText}>
          <p className={styles.rankLabel}>{placementLabel('champion')}</p>
          <p className={styles.championName}>{winner.name}</p>
        </div>
      </section>

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

      <p className={styles.note} aria-live="polite">
        {submit === null ? '' : submitStatusText(submit)}
      </p>
      <div className={styles.actions}>
        {submit !== null && canRetrySubmit(submit) && (
          <Button variant="secondary" size="lg" onClick={onRetry}>
            다시 보내기
          </Button>
        )}
        <Button variant="primary" size="lg" onClick={onRestart}>
          다시 하기
        </Button>
      </div>
    </div>
  );
}
