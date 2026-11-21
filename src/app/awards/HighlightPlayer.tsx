'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { formatTimecode } from '@/lib/games/timecode';
import { highlightEmbedUrl } from '@/lib/awards/media';
import styles from './awards.module.css';

// 대결 화면의 하이라이트 플레이어. 재생을 누른 뒤에만 마운트되므로 그 전에는 iframe이 없다.
// 판이 넘어가거나 닫으면 언마운트되어 재생이 멈춘다. 유튜브는 리퍼러가 없으면 오류 153이라 referrerPolicy를 명시한다.
export default function HighlightPlayer({
  name,
  videoId,
  startSec,
  onClose,
}: {
  name: string;
  videoId: string;
  startSec: number;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    rootRef.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  return (
    <div ref={rootRef} className={styles.player}>
      <div className={styles.playerHead}>
        <p className={styles.playerTitle}>
          <span className={styles.playerName}>{name}</span> 하이라이트 · <span className={styles.num}>{formatTimecode(startSec)}</span>부터
        </p>
        <button ref={closeRef} type="button" className={styles.playerClose} aria-label="하이라이트 닫기" onClick={onClose}>
          <X size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.playerFrame}>
        <iframe
          src={highlightEmbedUrl(videoId, startSec)}
          title={`${name} 하이라이트`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ width: '100%', height: '100%', border: 0 }}
        />
      </div>
    </div>
  );
}
