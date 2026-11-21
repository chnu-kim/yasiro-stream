import { useState } from 'react';
import PawMark from '@/components/PawMark';
import { cardMedia } from '@/lib/awards/media';
import type { AwardEntry } from '@/lib/awards/types';
import styles from './awards.module.css';

// 순위 행의 작은 썸네일. 64px 폭에서는 표본 라벨 글자가 잘리므로 그림만(포스터·현장 사진) 꽉 채우고, 없으면 발자국 타일
export default function RankThumb({ entry }: { entry: AwardEntry }) {
  const m = cardMedia(entry);
  // 결과 화면은 재생하지 않는다. clip이면 그 정지 그림(포스터 → 현장 사진 → 표본)을 쓴다
  const media = m.kind === 'clip' ? m.still : m;
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
