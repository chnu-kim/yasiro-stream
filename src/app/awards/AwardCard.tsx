import Poster from '../games/Poster';
import { formatDate } from '@/lib/games/query';
import type { AwardEntry } from '@/lib/awards/types';
import styles from './awards.module.css';

// 대결 카드 하나. 카드 전체가 버튼이다. 그림은 /games와 같은 Poster(포스터 → 현장 사진 → 표본 라벨, 정복 도장 없음).
// 그림 자리는 aria-hidden이다(표본 라벨 문구가 버튼 이름에 섞이지 않게). 버튼 이름은 "{이름} 고르기".
// 안쪽 래퍼를 판마다 key로 바꿔 진입 애니메이션을 주고, 버튼은 유지해 포커스가 같은 자리에 남는다.
// PR2: 하이라이트 영상은 lib/awards/media.ts cardMedia의 clip 분기로 여기 그림 자리에 들어간다.
export default function AwardCard({ entry, matchKey, onPick }: { entry: AwardEntry; matchKey: number; onPick: () => void }) {
  return (
    <button type="button" className={styles.card} onClick={onPick}>
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
  );
}
