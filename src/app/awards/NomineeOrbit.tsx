'use client';

import { useMemo } from 'react';
import { orbitItems } from '@/lib/awards/orbit';
import type { AwardEntry } from '@/lib/awards/types';
import GoldenKkul from './GoldenKkul';
import styles from './awards.module.css';

// 설정 화면 "후보들의 궤도": 황금 꿀붕이상 둘레를 후보 그림(AwardsApp이 고른 2026년에 한 게임)이 기울어진 고리로 돈다.
// CSS 3D(preserve-3d)라 포스터를 그냥 <img>로 띄운다(치지직 포스터는 CORS가 없어 WebGL 텍스처로 못 쓴다).
// 위치는 각도 하나(--spin + 출발 각 --a)에서 sin·cos로 계산하고, 뒤쪽일수록 어둡다. 동작 줄이기면 멈춘 고리다.
// launching(대진을 뽑는 중)이면 고리가 앞으로 다가온다. 장식이라 통째로 aria-hidden.
const MAX = 18;

export default function NomineeOrbit({ entries, launching }: { entries: readonly AwardEntry[]; launching: boolean }) {
  const items = useMemo(() => orbitItems(entries, MAX), [entries]);
  return (
    <div className={styles.orbit} data-launch={launching || undefined} aria-hidden="true">
      <div className={styles.orbitRing}>
        {items.map((it) => (
          <span key={it.id} className={styles.orbitItem} style={{ ['--a' as string]: `${it.angle}deg` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image는 unoptimized라 쓰지 않는다(CLAUDE.md) */}
            <img src={it.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
              onError={(e) => {
                // 못 읽은 그림은 빈 금 테두리 칸으로 남긴다
                e.currentTarget.style.visibility = 'hidden';
              }}
            />
          </span>
        ))}
        <span className={styles.orbitStatue}>
          <GoldenKkul height={170} className={styles.statue} />
        </span>
      </div>
    </div>
  );
}
