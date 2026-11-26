// 홈 히어로 ↔ /about 그림판 전환에서 두 캐릭터 그림을 "한 장이 움직이는 것처럼" 겹쳐 날리는 계산.
// 두 원화(yasiro1·yasiro4)는 같은 비율(1600×2277)에 얼굴 위치·크기까지 같은 구도라(얼굴 중심 폭 50%·높이 20%, 눈 간격 폭 7%),
// 이미지 상자끼리 맞추면 얼굴이 겹친다. 그래서 옛 그림은 새 이미지 상자로, 새 그림은 옛 이미지 상자에서 출발하게 한다.
// 좌표는 모두 뷰포트 px. 변환은 그룹(새 상자 자리에 멈춰 둠) 기준, transform-origin 0 0.

export type Rect = { x: number; y: number; w: number; h: number };

// 이름 붙인 상자(box)와 그 안의 캐릭터 이미지(img) 한 쌍
export type FigureMeasure = { box: Rect; img: Rect };

export type MorphTransforms = {
  old: [string, string];
  new: [string, string];
};

function transform(x: number, y: number, s: number): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  return `translate(${r(x)}px, ${r(y)}px) scale(${Math.round(s * 10000) / 10000})`;
}

// oldBox·newBox는 전환 스냅샷의 자리(그룹 키프레임에서 읽은 값), 이미지 위치는 상자 안 상대값으로만 쓴다.
// 스냅샷 이후 스크롤이 바뀌어도 상자 안 상대 위치는 그대로라 어긋나지 않는다.
export function morphTransforms(oldM: FigureMeasure, newM: FigureMeasure, oldBox: Rect, newBox: Rect): MorphTransforms | null {
  if (oldM.img.w <= 0 || newM.img.w <= 0) return null;
  const s = newM.img.w / oldM.img.w;
  // 상자 기준 이미지 위치
  const oi = { x: oldM.img.x - oldM.box.x, y: oldM.img.y - oldM.box.y };
  const ni = { x: newM.img.x - newM.box.x, y: newM.img.y - newM.box.y };
  // 그룹(새 상자) 기준 옛 스냅샷 자리
  const o = { x: oldBox.x - newBox.x, y: oldBox.y - newBox.y };
  // 옛 그림: 제자리 → 옛 이미지가 새 이미지에 겹치는 자리(크기 s배)
  const end = { x: ni.x - s * oi.x, y: ni.y - s * oi.y };
  // 새 그림: 새 이미지가 옛 이미지에 겹치는 자리(크기 1/s배) → 제자리
  const start = { x: o.x + oi.x - ni.x / s, y: o.y + oi.y - ni.y / s };
  return {
    old: [transform(o.x, o.y, 1), transform(end.x, end.y, s)],
    new: [transform(start.x, start.y, 1 / s), transform(0, 0, 1)],
  };
}

// UA 그룹 애니메이션의 첫·끝 키프레임(transform: matrix(...) 또는 none, width, height) → 상자
export function rectFromKeyframe(k: Record<string, unknown>): Rect | null {
  const w = parseFloat(String(k.width));
  const h = parseFloat(String(k.height));
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  const t = String(k.transform ?? 'none');
  if (t === 'none') return { x: 0, y: 0, w, h };
  const m = /^matrix\(([^)]+)\)$/.exec(t);
  if (!m) return null;
  const v = m[1].split(',').map((n) => parseFloat(n));
  if (v.length !== 6 || v.some((n) => !Number.isFinite(n))) return null;
  return { x: v[4], y: v[5], w, h };
}

// 시간표(ms). 옛 본문이 먼저 빠지고, 캐릭터가 이동하는 동안 새 본문이 차례로 떠오른다.
// 새 그림을 위에 먼저 다 덮은 뒤 옛 그림을 지운다(둘이 동시에 반투명해져 바탕이 비치는 일을 막는다).
export const HERO_MORPH = {
  duration: 720,
  easing: 'cubic-bezier(0.65, 0, 0.25, 1)',
  // 두 그림의 교차(목적지별). 홈 히어로는 아래가 바탕에 스며드는 그림이라, 홈으로 갈 때 늦게 바꾸면 끝 무렵에 아래가 한꺼번에 흐려진다.
  // 그래서 홈으로 갈 때는 홈 그림을 일찍 덮고 옛 그림(아래가 안 흐려진 소개 전신)을 길게 빼서 흐려짐이 이동 중에 천천히 드러나게 한다
  opacity: {
    about: {
      new: [
        { offset: 0, opacity: 0 },
        { offset: 0.35, opacity: 0 },
        { offset: 0.7, opacity: 1 },
        { offset: 1, opacity: 1 },
      ],
      old: [
        { offset: 0, opacity: 1 },
        { offset: 0.6, opacity: 1 },
        { offset: 0.85, opacity: 0 },
        { offset: 1, opacity: 0 },
      ],
    },
    home: {
      new: [
        { offset: 0, opacity: 0 },
        { offset: 0.08, opacity: 0 },
        { offset: 0.42, opacity: 1 },
        { offset: 1, opacity: 1 },
      ],
      old: [
        { offset: 0, opacity: 1 },
        { offset: 0.2, opacity: 1 },
        { offset: 0.62, opacity: 0 },
        { offset: 1, opacity: 0 },
      ],
    },
  },
  // 짝이 지어지면 새 페이지의 등장 애니메이션(globals.css: 본문·제목 순차 등장·띠·도장)을 모두 이만큼 늦춘다.
  // 간격은 그대로라 순서가 유지된다. 본문 기본 등장 80ms + 60 = 140ms(캐릭터 이동과 겹쳐 들어온다)
  enterShift: 60,
} as const;

// ── 전환 연출 실행(components/HeroFigure의 onShare). DOM·Web Animations는 아래 모양으로만 다뤄 테스트에서 가짜로 바꾼다 ──

type Cancelable = { cancel(): void };
export type PseudoLike = {
  animate(keyframes: Keyframe[] | PropertyIndexedKeyframes, options: KeyframeAnimationOptions): Cancelable;
  getAnimations(): Array<Cancelable & { effect: { getKeyframes(): Array<Record<string, unknown>> } | null }>;
};
export type MorphInstance = { name: string; group: PseudoLike; imagePair: PseudoLike; old: PseudoLike; new: PseudoLike };

// 문서의 CSS 애니메이션 하나(대상 pseudo, 지금 delay, delay 바꾸기)
export type DocAnimation = { pseudo: string | null; delay: number; setDelay(ms: number): void };

// 캐릭터가 도착하는 쪽
export type HeroSide = keyof typeof HERO_MORPH.opacity;

// 그룹(UA) 애니메이션의 첫·끝 키프레임 → 옛·새 상자
export function groupRects(group: PseudoLike): [Rect, Rect] | null {
  const frames = group.getAnimations()[0]?.effect?.getKeyframes();
  if (!frames || frames.length < 2) return null;
  const from = rectFromKeyframe(frames[0]);
  const to = rectFromKeyframe(frames[frames.length - 1]);
  return from && to ? [from, to] : null;
}

// 새 페이지의 등장(::view-transition-new) 애니메이션을 shift만큼 늦춘다. 캐릭터(name) 자신은 뺀다
export function shiftEnters(anims: DocAnimation[], name: string, shift: number): number {
  let n = 0;
  for (const a of anims) {
    if (!a.pseudo?.startsWith('::view-transition-new(') || a.pseudo === `::view-transition-new(${name})`) continue;
    a.setDelay(a.delay + shift);
    n++;
  }
  return n;
}

// 짝이 지어진 순간 한 번: 기본 모핑을 걷어 내고 얼굴 맞춘 두 그림을 날린 뒤 새 페이지 등장을 늦춘다.
// 계산할 수 없으면(측정 실패·모션 줄이기) 아무것도 바꾸지 않고 null(브라우저 기본 전환이 돈다). 돌려주는 함수는 정리용
export function runHeroMorph(args: {
  instance: MorphInstance;
  oldM: FigureMeasure | null;
  newM: FigureMeasure | null;
  reducedMotion: boolean;
  to: HeroSide | null;
  docAnimations: () => DocAnimation[];
}): (() => void) | null {
  const { instance, oldM, newM } = args;
  if (args.reducedMotion || !oldM || !newM || !args.to) return null;
  const boxes = groupRects(instance.group);
  if (!boxes) return null;
  const t = morphTransforms(oldM, newM, boxes[0], boxes[1]);
  if (!t) return null;

  // 그룹은 새 상자 자리에 멈춘다(UA가 끝 상태를 정적 스타일로 둔다)
  for (const part of [instance.group, instance.imagePair, instance.old, instance.new]) {
    for (const a of part.getAnimations()) a.cancel();
  }
  const move = { duration: HERO_MORPH.duration, easing: HERO_MORPH.easing, fill: 'both' as const };
  const fade = { duration: HERO_MORPH.duration, easing: 'linear', fill: 'both' as const };
  const anims = [
    instance.old.animate({ transform: [...t.old] }, move),
    instance.new.animate({ transform: [...t.new] }, move),
    instance.old.animate([...HERO_MORPH.opacity[args.to].old], fade),
    instance.new.animate([...HERO_MORPH.opacity[args.to].new], fade),
  ];
  shiftEnters(args.docAnimations(), instance.name, HERO_MORPH.enterShift);
  return () => anims.forEach((a) => a.cancel());
}
