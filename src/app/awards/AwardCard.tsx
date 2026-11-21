import type { Ref } from 'react';
import { Play } from 'lucide-react';
import Poster from '../games/Poster';
import { formatDate } from '@/lib/games/query';
import { cardMedia } from '@/lib/awards/media';
import type { AwardEntry } from '@/lib/awards/types';
import styles from './awards.module.css';

// 대결 카드 하나. 고르기 버튼(.pick)과 하이라이트 재생 버튼(.play)은 형제 버튼이라 재생 클릭이 고르기로 번지지 않는다.
// 그림은 /games와 같은 Poster(포스터 → 현장 사진 → 표본 라벨, 정복 도장 없음). 그림 자리는 aria-hidden이다
// (표본 라벨 문구가 버튼 이름에 섞이지 않게). 고르기 버튼 이름은 "{이름} 고르기".
// 안쪽 래퍼를 판마다 key로 바꿔 진입 애니메이션을 주고, 버튼은 유지해 포커스가 같은 자리에 남는다.
// 재생 버튼은 시작 시각이 적힌 다시보기(cardMedia의 clip)가 있을 때만 나온다. 영상은 MatchScreen의 HighlightPlayer가 연다.
export default function AwardCard({
  entry,
  matchKey,
  playing,
  playRef,
  onPick,
  onPlay,
}: {
  entry: AwardEntry;
  matchKey: number;
  playing: boolean;
  playRef: Ref<HTMLButtonElement>;
  onPick: () => void;
  onPlay: () => void;
}) {
  const media = cardMedia(entry);
  return (
    <div className={styles.card}>
      <button type="button" className={styles.pick} onClick={onPick}>
        <span key={matchKey} className={styles.cardInner}>
          <span className={styles.cardCover} aria-hidden="true">
            <Poster game={entry} eager showNo={false} stamp={false} stampTopWhenEmpty nameWideOnly />
          </span>
          <span className={styles.cardName}>
            {entry.name}
            <span className={styles.srOnly}> 고르기</span>
          </span>
          <span className={styles.cardDate}>{formatDate(entry.firstPlayed)}</span>
        </span>
      </button>
      {media.kind === 'clip' && (
        <button
          key={matchKey}
          ref={playRef}
          type="button"
          className={styles.play}
          aria-pressed={playing}
          aria-label={`${entry.name} 하이라이트 재생`}
          onClick={onPlay}
        >
          <Play size={16} strokeWidth={2} aria-hidden="true" />
          <span className={styles.playText}>하이라이트</span>
        </button>
      )}
    </div>
  );
}
