'use client';

// 황금 꿀붕이상: 시상식 패러디 트로피. 필름 띠를 두른 금빛 지구본 위에 꿀붕이(KkulMark와 같은 32px 격자 그림)가 앉고,
// 아래는 계단식 받침이다. 금박 그러데이션은 globals.css의 --gala-gold 계열. 장식이라 aria-hidden.
// 그러데이션 id는 인스턴스마다 useId로 만든다(한 화면에 여럿이어도 겹치지 않게).
import { useId, type CSSProperties } from 'react';

const BODY = 'M16 5.2C24.6 5.2 30.4 10.8 30.4 18.2C30.4 25 25.6 30 16 30C6.4 30 1.6 25 1.6 18.2C1.6 10.8 7.4 5.2 16 5.2Z';

export default function GoldenKkul({ height = 132, className, style }: { height?: number; className?: string; style?: CSSProperties }) {
  const id = useId().replace(/:/g, '');
  const gold = `${id}-gold`;
  const globe = `${id}-globe`;
  const base = `${id}-base`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 80 140"
      height={height}
      width={(height * 80) / 140}
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--gala-gold-hi)' }} />
          <stop offset="0.55" style={{ stopColor: 'var(--gala-gold)' }} />
          <stop offset="1" style={{ stopColor: 'var(--gala-gold-deep)' }} />
        </linearGradient>
        <radialGradient id={globe} cx="0.36" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#FFF1C8" />
          <stop offset="0.35" style={{ stopColor: 'var(--gala-gold-hi)' }} />
          <stop offset="0.8" style={{ stopColor: 'var(--gala-gold)' }} />
          <stop offset="1" style={{ stopColor: 'var(--gala-gold-deep)' }} />
        </radialGradient>
        <linearGradient id={base} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--gala-panel-hi)' }} />
          <stop offset="1" stopColor="#090705" />
        </linearGradient>
      </defs>

      {/* 꿀붕이: 금 한 덩이로 주조한 것처럼 몸·귀는 금박, 얼굴은 그늘 색으로만 새긴다 */}
      <g transform="translate(26.2 6) scale(0.86)">
        <path d="M14.2 5.8C14.3 3.6 15.6 1.6 18.2 0.9C16.9 2.6 17 4.3 18.6 5.9Z" fill={`url(#${gold})`} />
        <path d={BODY} fill={`url(#${gold})`} />
        <path d="M28.63 24.53C26.45 27.89 22.24 30 16 30C9.76 30 5.55 27.89 3.37 24.53Q16 25.9 28.63 24.53Z" style={{ fill: 'var(--gala-gold-hi)' }} opacity="0.7" />
        <circle cx="9.7" cy="17.4" r="1.45" style={{ fill: 'var(--gala-gold-deep)' }} />
        <circle cx="22.3" cy="17.4" r="1.45" style={{ fill: 'var(--gala-gold-deep)' }} />
        <ellipse cx="16" cy="18.9" rx="1.15" ry="0.75" style={{ fill: 'var(--gala-gold-deep)' }} />
      </g>

      {/* 지구본 + 경선·위선 */}
      <circle cx="40" cy="62" r="23" fill={`url(#${globe})`} />
      <g fill="none" strokeWidth="0.9" opacity="0.75" style={{ stroke: 'var(--gala-gold-deep)' }}>
        <ellipse cx="40" cy="62" rx="9" ry="23" />
        <ellipse cx="40" cy="62" rx="17" ry="23" />
        <line x1="40" y1="39" x2="40" y2="85" />
        <path d="M19 52 Q40 57 61 52" />
        <path d="M17.5 66 Q40 71 62.5 66" />
        <path d="M22 77 Q40 81 58 77" />
      </g>

      {/* 지구본을 비스듬히 감는 필름 띠(구멍 줄 두 개) */}
      <g transform="rotate(-16 40 62)">
        <ellipse cx="40" cy="62" rx="35" ry="9.5" fill="none" stroke={`url(#${gold})`} strokeWidth="6" />
        <ellipse cx="40" cy="62" rx="35" ry="9.5" fill="none" strokeWidth="1.1" strokeDasharray="1.6 2.6" transform="translate(0 -1.6)" opacity="0.85" style={{ stroke: 'var(--gala-bg)' }} />
        <ellipse cx="40" cy="62" rx="35" ry="9.5" fill="none" strokeWidth="1.1" strokeDasharray="1.6 2.6" transform="translate(0 1.6)" opacity="0.85" style={{ stroke: 'var(--gala-bg)' }} />
      </g>

      {/* 목 + 계단식 받침(검은 대리석에 금 테두리) */}
      <path d="M33 84 L47 84 L44 96 L36 96 Z" fill={`url(#${gold})`} />
      <rect x="25" y="96" width="30" height="7" rx="1" fill={`url(#${gold})`} />
      <rect x="19" y="103" width="42" height="12" rx="1" fill={`url(#${base})`} strokeWidth="0.8" style={{ stroke: 'var(--gala-gold)' }} />
      <rect x="13" y="115" width="54" height="19" rx="1.5" fill={`url(#${base})`} strokeWidth="0.8" style={{ stroke: 'var(--gala-gold)' }} />
      <rect x="28" y="121" width="24" height="7" rx="0.6" fill="none" strokeWidth="0.7" opacity="0.8" style={{ stroke: 'var(--gala-gold)' }} />
    </svg>
  );
}
