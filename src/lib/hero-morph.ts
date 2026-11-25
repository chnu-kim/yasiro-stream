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

// 시간표(ms). 옛 본문이 먼저 빠지고 → 캐릭터가 이동하고 → 거의 도착할 때 새 본문이 들어온다.
// 새 그림을 위에 먼저 다 덮은 뒤 옛 그림을 지운다(둘이 동시에 반투명해져 바탕이 비치는 일을 막는다).
export const HERO_MORPH = {
  duration: 720,
  easing: 'cubic-bezier(0.65, 0, 0.25, 1)',
  newOpacity: [
    { offset: 0, opacity: 0 },
    { offset: 0.35, opacity: 0 },
    { offset: 0.7, opacity: 1 },
    { offset: 1, opacity: 1 },
  ],
  oldOpacity: [
    { offset: 0, opacity: 1 },
    { offset: 0.6, opacity: 1 },
    { offset: 0.85, opacity: 0 },
    { offset: 1, opacity: 0 },
  ],
  // 새 본문(template page-in)의 등장을 캐릭터 도착에 맞춰 늦춘다
  pageInDelay: 320,
  pageInDuration: 340,
} as const;
