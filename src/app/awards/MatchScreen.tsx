import type { Ref } from 'react';
import { Undo2 } from 'lucide-react';
import Button from '@/components/Button';
import SectionLabel from '@/components/SectionLabel';
import { DIVISION_LABEL } from '@/lib/awards/entries';
import { matchAnnouncement, PAGE_TITLE, progressLabel } from '@/lib/awards/labels';
import { currentMatch, progress } from '@/lib/awards/tournament';
import type { AwardEntry, TournamentState } from '@/lib/awards/types';
import AwardCard from './AwardCard';
import styles from './awards.module.css';

// 대결 화면: 진행 표시 + 두 카드(항상 가로 2열) + 되돌리기·처음으로.
export default function MatchScreen({
  run,
  byId,
  headingRef,
  onPick,
  onUndo,
  onRestart,
}: {
  run: TournamentState;
  byId: ReadonlyMap<string, AwardEntry>;
  headingRef: Ref<HTMLHeadingElement>;
  onPick: (winnerId: string, expectedIndex: number) => void;
  onUndo: () => void;
  onRestart: () => void;
}) {
  const match = currentMatch(run)!;
  const p = progress(run);
  const a = byId.get(match.a)!;
  const b = byId.get(match.b)!;
  const label = progressLabel(p);

  const restart = () => {
    if (run.picks.length === 0 || window.confirm('진행 중인 대진을 그만두고 처음으로 돌아갈까요?')) onRestart();
  };

  return (
    <div className={styles.wrap}>
      <h1 className={styles.srOnly}>{PAGE_TITLE}</h1>
      <header className={styles.matchHeader}>
        <div className={styles.matchTop}>
          <SectionLabel style={{ marginBottom: 0 }}>{DIVISION_LABEL[run.division]}</SectionLabel>
          <p className={styles.overall}>
            전체 <span className={styles.num}>{p.done}/{p.total}</span>
          </p>
        </div>
        <h2 ref={headingRef} tabIndex={-1} className={styles.round}>
          {label}
        </h2>
        <div className={styles.bar} aria-hidden="true">
          <div className={styles.barFill} style={{ width: `${(p.done / p.total) * 100}%` }} />
        </div>
        <p className={styles.hint}>더 마음에 드는 게임을 고르세요.</p>
      </header>
      <p className={styles.srOnly} aria-live="polite">
        {matchAnnouncement(p, a.name, b.name)}
      </p>

      <div className={styles.versus}>
        <AwardCard entry={a} matchKey={match.pickIndex} onPick={() => onPick(a.id, match.pickIndex)} />
        <span className={styles.vs} aria-hidden="true">
          VS
        </span>
        <AwardCard entry={b} matchKey={match.pickIndex} onPick={() => onPick(b.id, match.pickIndex)} />
      </div>

      <div className={styles.tools}>
        <Button variant="ghost" icon={<Undo2 size={16} strokeWidth={1.8} />} disabled={run.picks.length === 0} onClick={onUndo}>
          되돌리기
        </Button>
        <Button variant="ghost" onClick={restart}>
          처음으로
        </Button>
      </div>
    </div>
  );
}
