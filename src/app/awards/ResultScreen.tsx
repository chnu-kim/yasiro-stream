import { useState, type Ref } from 'react';
import PawMark from '@/components/PawMark';
import { cardMedia } from '@/lib/awards/media';
import Button from '@/components/Button';
import SectionLabel from '@/components/SectionLabel';
import TapeStrip from '@/components/TapeStrip';
import { DIVISION_LABEL } from '@/lib/awards/entries';
import { placementLabel, resultSummary } from '@/lib/awards/labels';
import { placements, totalMatches } from '@/lib/awards/tournament';
import type { AwardEntry, TournamentState } from '@/lib/awards/types';
import Poster from '../games/Poster';
import styles from './awards.module.css';

// 결과 화면: 우승 큰 카드 + 나머지 순위 기록지 행. 저장하지 않는다.
export default function ResultScreen({
  run,
  byId,
  headingRef,
  onRestart,
}: {
  run: TournamentState;
  byId: ReadonlyMap<string, AwardEntry>;
  headingRef: Ref<HTMLHeadingElement>;
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

      <p className={styles.note}>결과는 이 브라우저에만 보이고 저장되지 않아요.</p>
      <div className={styles.actions}>
        <Button variant="primary" size="lg" onClick={onRestart}>
          다시 하기
        </Button>
      </div>
    </div>
  );
}

// 순위 행의 작은 썸네일. 64px 폭에서는 표본 라벨 글자가 잘리므로 그림만(포스터·현장 사진) 꽉 채우고, 없으면 발자국 타일
function RankThumb({ entry }: { entry: AwardEntry }) {
  const media = cardMedia(entry);
  const [failed, setFailed] = useState(false);
  const url = media.kind === 'specimen' || failed ? null : media.url;
  return (
    <span className={styles.rankThumb} aria-hidden="true">
      {url === null ? (
        <span className={styles.rankThumbEmpty}>
          <PawMark size={28} />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- next/image는 unoptimized라 쓰지 않는다(CLAUDE.md)
        <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={styles.rankThumbImg} />
      )}
    </span>
  );
}
