import styles from './page.module.css';

export type StickerKind = 'meat' | 'chat' | 'idle';

// 취향 단어 옆에 붙인 스티커 그림. 오려 붙인 느낌은 흰 칼선 테두리(같은 모양을 굵은 흰 선으로 한 번 더 그림) + 기울기 + 그림자로 낸다.
// 뜻은 옆 글자가 전하므로 장식(aria-hidden)
const INK = '#3A2A1A';
const CUT = { fill: '#FFFDF8', stroke: '#FFFDF8', strokeWidth: 8, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
const LINE = { stroke: INK, strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

// 만화 고기(뼈 달린 고기)
function Meat() {
  const shape = (
    <>
      <path d="M14 50 L50 14" strokeWidth={16} />
      <circle cx="11" cy="47" r="4.5" />
      <circle cx="17" cy="53" r="4.5" />
      <circle cx="47" cy="11" r="4.5" />
      <circle cx="53" cy="17" r="4.5" />
      <ellipse cx="32" cy="32" rx="18" ry="13" transform="rotate(-45 32 32)" />
    </>
  );
  return (
    <>
      <g {...CUT}>{shape}</g>
      {/* 뼈: 잉크 층(조금 크게)을 먼저 다 그리고 크림 층을 위에 덮어 윤곽이 하나로 이어지게 */}
      <path d="M14 50 L50 14" stroke={INK} strokeWidth={8} strokeLinecap="round" />
      <g fill={INK}>
        <circle cx="11" cy="47" r="5.5" />
        <circle cx="17" cy="53" r="5.5" />
        <circle cx="47" cy="11" r="5.5" />
        <circle cx="53" cy="17" r="5.5" />
      </g>
      <g fill="#F3E6CC">
        <circle cx="11" cy="47" r="3.6" />
        <circle cx="17" cy="53" r="3.6" />
        <circle cx="47" cy="11" r="3.6" />
        <circle cx="53" cy="17" r="3.6" />
      </g>
      <path d="M14 50 L50 14" stroke="#F3E6CC" strokeWidth={4.2} strokeLinecap="round" />
      <ellipse cx="32" cy="32" rx="18" ry="13" transform="rotate(-45 32 32)" fill="#B4532A" {...LINE} />
      <ellipse cx="28" cy="27" rx="7" ry="3.5" transform="rotate(-45 28 27)" fill="#DE8A55" />
      <path d="M36 40 q4 -1 6 -5" fill="none" stroke="#7E3417" strokeWidth={1.6} strokeLinecap="round" />
    </>
  );
}

// 소통: 겹친 말풍선 두 개(하트 / 점 세 개)
function Chat() {
  const back = 'M30 10 h22 a6 6 0 0 1 6 6 v12 a6 6 0 0 1 -6 6 h-4 l2 6 l-9 -6 h-11 a6 6 0 0 1 -6 -6 v-12 a6 6 0 0 1 6 -6 z';
  const front = 'M12 24 h24 a7 7 0 0 1 7 7 v12 a7 7 0 0 1 -7 7 h-14 l-9 7 l1 -7 h-2 a7 7 0 0 1 -7 -7 v-12 a7 7 0 0 1 7 -7 z';
  return (
    <>
      <g {...CUT}>
        <path d={back} />
        <path d={front} />
      </g>
      <path d={back} fill="#F3E6CC" {...LINE} />
      <path d="M41 19.5 c-1.6 -2.6 -5.4 -1.2 -4.4 1.8 c0.6 1.8 4.4 4.4 4.4 4.4 s3.8 -2.6 4.4 -4.4 c1 -3 -2.8 -4.4 -4.4 -1.8 z" fill="#C9472F" />
      <path d={front} fill="#E3A33B" {...LINE} />
      <g fill={INK}>
        <circle cx="17" cy="37" r="2.4" />
        <circle cx="24" cy="37" r="2.4" />
        <circle cx="31" cy="37" r="2.4" />
      </g>
    </>
  );
}

// 가만히 있기: 소파와 Zz
function Idle() {
  const sofa =
    'M10 30 a5 5 0 0 1 10 0 v-6 a5 5 0 0 1 5 -5 h14 a5 5 0 0 1 5 5 v6 a5 5 0 0 1 10 0 v16 h-4 v5 h-6 v-5 h-24 v5 h-6 v-5 h-4 z';
  return (
    <>
      <g {...CUT}>
        <path d={sofa} />
        <path d="M44 6 h8 l-8 9 h8 M36 9 h4.5 l-4.5 5 h4.5" strokeWidth={10} fill="none" />
      </g>
      <path d={sofa} fill="#8E6A9E" {...LINE} />
      <path d="M20 38 h24" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <path d="M20 30 v8 M44 30 v8" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <path d="M24 24 h16" stroke="#B394C0" strokeWidth={2.4} strokeLinecap="round" />
      <path d="M44 6 h8 l-8 9 h8" fill="none" {...LINE} strokeWidth={2.2} />
      <path d="M36 9 h4.5 l-4.5 5 h4.5" fill="none" {...LINE} strokeWidth={1.8} />
    </>
  );
}

const ART = { meat: Meat, chat: Chat, idle: Idle };

export default function TasteSticker({ kind }: { kind: StickerKind }) {
  const Art = ART[kind];
  return (
    <svg className={styles.sticker} data-kind={kind} viewBox="-2 -2 68 68" aria-hidden="true" focusable="false">
      <Art />
    </svg>
  );
}
