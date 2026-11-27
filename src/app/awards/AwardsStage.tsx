'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { orbitItems, stageTextureUrl } from '@/lib/awards/orbit';
import type { AwardEntry } from '@/lib/awards/types';
import NomineeOrbit from './NomineeOrbit';
import type { Stage, StageIntro } from './stage/createStage';
import styles from './awards.module.css';

// 입장 화면 배경의 3D 무대(Three.js). 장면 모듈은 여기서만 동적 import한다(three는 /awards 번들에만).
// WebGL을 못 쓰거나 불러오기에 실패하면 CSS 궤도(NomineeOrbit)로 대신하고, 그때도 onReady를 불러 자막이 진행되게 한다.
// skipKey가 바뀌면 입장 연출을 건너뛰고, paused면 대기 움직임을 멈춘다(WCAG 2.2.2). 진행 중에 동작 줄이기가 켜지면 완성 장면으로 멈춘다.
// 장식이라 aria-hidden이고 버튼·모달은 그대로 HTML이다.
const MAX = 200; // 벽 띠가 흐르며 올해 한 게임(그림 있는 후보 전부)을 차례로 보인다. 96이면 운영 133편 중 37편이 빠졌다(11-27). 모바일은 createStage가 24개로 줄인다

export default function AwardsStage({
  entries,
  intro,
  launching,
  skipKey,
  paused,
  onReady,
}: {
  entries: readonly AwardEntry[];
  intro: StageIntro;
  launching: boolean;
  skipKey: number;
  paused: boolean;
  onReady: () => void;
}) {
  const items = useMemo(() => orbitItems(entries, MAX).map((it) => ({ id: it.id, url: stageTextureUrl(it.url) })), [entries]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const [failed, setFailed] = useState(false);
  const readyRef = useRef(onReady);
  useEffect(() => {
    readyRef.current = onReady;
  });
  // 첫 값만 쓴다(연출 방식이 중간에 바뀌어 장면을 다시 만들지 않게)
  const [introMode] = useState(intro);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let disposed = false;
    import('./stage/createStage')
      .then(({ createStage }) => {
        if (disposed) return;
        stageRef.current = createStage(canvas, {
          items,
          intro: introMode,
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          compact: window.matchMedia('(max-width: 640px)').matches,
          onReady: () => readyRef.current(),
        });
      })
      .catch(() => {
        if (disposed) return;
        setFailed(true);
        readyRef.current();
      });
    return () => {
      disposed = true;
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, [items, introMode]);

  useEffect(() => {
    stageRef.current?.setLaunch(launching);
  }, [launching]);

  useEffect(() => {
    if (skipKey > 0) stageRef.current?.skipIntro();
  }, [skipKey]);

  useEffect(() => {
    stageRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => stageRef.current?.setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (failed) {
    return (
      <div className={styles.stageFallback} aria-hidden="true">
        <NomineeOrbit entries={entries} launching={launching} />
      </div>
    );
  }
  return <canvas ref={canvasRef} className={styles.stageCanvas} aria-hidden="true" />;
}
