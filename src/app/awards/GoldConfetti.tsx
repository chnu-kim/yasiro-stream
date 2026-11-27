'use client';

import { useEffect, useRef } from 'react';
import styles from './awards.module.css';

// 우승 발표 때 한 번 흩날리는 금가루(canvas 2D, 약 3초). 동작 줄이기면 그리지 않는다. 장식이라 aria-hidden.
const COLORS = ['#EDCF83', '#D9B45A', '#FFF1C8', '#B8912F'];
const COUNT = 140;
const DURATION_MS = 3200;

export default function GoldConfetti() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // 화면 위 가운데에서 부채꼴로 터져 떨어진다
    const bits = Array.from({ length: COUNT }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
      const speed = 5 + Math.random() * 7;
      return {
        x: w / 2 + (Math.random() - 0.5) * 80,
        y: h * 0.32,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 5,
        spin: Math.random() * Math.PI,
        vspin: (Math.random() - 0.5) * 0.3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    });

    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - DURATION_MS * 0.6) / (DURATION_MS * 0.4));
      for (const b of bits) {
        b.vy += 0.18;
        b.vx *= 0.99;
        b.x += b.vx;
        b.y += b.vy;
        b.spin += b.vspin;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.spin);
        ctx.scale(1, Math.cos(b.spin * 2)); // 뒤집히며 반짝이는 느낌
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
        ctx.restore();
      }
      if (t < DURATION_MS) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={ref} className={styles.confetti} aria-hidden="true" />;
}
