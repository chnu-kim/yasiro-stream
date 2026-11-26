import { useEffect, useRef, useState, type Ref } from 'react';
import { Undo2 } from 'lucide-react';
import Button from '@/components/Button';
import { DIVISION_LABEL } from '@/lib/awards/entries';
import { CATEGORY_CARD, DIVISION_AWARD, matchAnnouncement, PAGE_TITLE, progressLabel } from '@/lib/awards/labels';
import { cardMedia } from '@/lib/awards/media';
import { currentMatch, progress } from '@/lib/awards/tournament';
import type { AwardEntry, TournamentState } from '@/lib/awards/types';
import AwardCard from './AwardCard';
import HighlightPlayer from './HighlightPlayer';
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

  // 부문 카드: 대결 화면에 처음 들어올 때(첫 판) 약 1.6초 보이고 사라진다. 누르면 바로 닫힌다. 장식이라 aria-hidden(부문은 머리말에 있다)
  const [card, setCard] = useState(() => run.picks.length === 0);
  useEffect(() => {
    if (!card) return;
    const t = window.setTimeout(() => setCard(false), 1600);
    return () => window.clearTimeout(t);
  }, [card]);
  const [cardEyebrow, cardTitle] = CATEGORY_CARD[run.division];

  // 재생 중인 카드. 판(pickIndex)이 바뀌면 active가 null이 되어 플레이어가 언마운트된다(재생 정지)
  const [playing, setPlaying] = useState<{ pickIndex: number; id: string } | null>(null);
  const playRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active =
    playing !== null && playing.pickIndex === match.pickIndex && (playing.id === a.id || playing.id === b.id) ? playing.id : null;
  const activeEntry = active === null ? null : active === a.id ? a : b;
  const activeClip = activeEntry === null ? null : cardMedia(activeEntry);

  const togglePlay = (id: string) => setPlaying(active === id ? null : { pickIndex: match.pickIndex, id });
  const closePlayer = () => {
    const id = active;
    setPlaying(null);
    if (id !== null) playRefs.current[id]?.focus();
  };
  const pick = (id: string) => {
    setPlaying(null);
    onPick(id, match.pickIndex);
  };
  const undo = () => {
    setPlaying(null);
    onUndo();
  };
  const restart = () => {
    if (run.picks.length === 0 || window.confirm('진행 중인 대진을 그만두고 처음으로 돌아갈까요?')) {
      setPlaying(null);
      onRestart();
    }
  };

  return (
    <div className={styles.wrap}>
      <h1 className={styles.srOnly}>{PAGE_TITLE}</h1>
      <div className={styles.fromBlack} aria-hidden="true" />
      {card && (
        <div className={styles.categoryCard} aria-hidden="true" onPointerDown={() => setCard(false)}>
          <svg className={styles.categoryRing} viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="92" />
            <circle cx="100" cy="100" r="80" />
          </svg>
          <p className={styles.kicker}>{cardEyebrow}</p>
          <p className={styles.categoryTitle}>{cardTitle}</p>
        </div>
      )}
      <header className={styles.matchHeader}>
        <div className={styles.matchTop}>
          <p className={styles.kicker}>Nominees · {DIVISION_AWARD[run.division]}</p>
          <p className={styles.overall}>
            {DIVISION_LABEL[run.division]} · 전체 <span className={styles.num}>{p.done}/{p.total}</span>
          </p>
        </div>
        <h2 ref={headingRef} tabIndex={-1} className={styles.round}>
          {label}
        </h2>
        <div className={styles.bar} aria-hidden="true">
          <div className={styles.barFill} style={{ width: `${(p.done / p.total) * 100}%` }} />
        </div>
        <p className={styles.hint}>더 마음에 드는 게임을 꾹 눌러 고르세요.</p>
      </header>
      <p className={styles.srOnly} aria-live="polite">
        {matchAnnouncement(p, a.name, b.name)}
      </p>

      {activeEntry !== null && activeClip?.kind === 'clip' && (
        <HighlightPlayer
          key={activeEntry.id}
          name={activeEntry.name}
          videoId={activeClip.videoId}
          startSec={activeClip.startSec}
          onClose={closePlayer}
        />
      )}

      <div className={`${styles.versus} ${styles.versusIn}`}>
        <span className={styles.spot} aria-hidden="true" />
        <AwardCard
          entry={a}
          matchKey={match.pickIndex}
          playing={active === a.id}
          playRef={(el) => {
            playRefs.current[a.id] = el;
          }}
          onPick={() => pick(a.id)}
          onPlay={() => togglePlay(a.id)}
        />
        <span className={styles.vs} aria-hidden="true">
          VS
        </span>
        <AwardCard
          entry={b}
          matchKey={match.pickIndex}
          playing={active === b.id}
          playRef={(el) => {
            playRefs.current[b.id] = el;
          }}
          onPick={() => pick(b.id)}
          onPlay={() => togglePlay(b.id)}
        />
      </div>

      <div className={styles.tools}>
        <Button variant="ghost" icon={<Undo2 size={16} strokeWidth={1.8} />} disabled={run.picks.length === 0} onClick={undo}>
          되돌리기
        </Button>
        <Button variant="ghost" onClick={restart}>
          처음으로
        </Button>
      </div>
    </div>
  );
}
