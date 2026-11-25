import { describe, expect, it } from 'vitest';
import { morphTransforms, rectFromKeyframe, type FigureMeasure, type Rect } from './hero-morph';

// transform 문자열을 적용해 점이 어디로 가는지 본다(origin 0 0)
function apply(t: string, p: { x: number; y: number }) {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(t)!;
  const [tx, ty, s] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return { x: tx + s * p.x, y: ty + s * p.y };
}

const oldM: FigureMeasure = { box: { x: 628, y: 64, w: 604, h: 660 }, img: { x: 900, y: 112, w: 1124, h: 1600 } };
const newM: FigureMeasure = { box: { x: 0, y: 64, w: 630, h: 672 }, img: { x: 150, y: 80, w: 600, h: 854 } };
const oldBox: Rect = oldM.box;
const newBox: Rect = newM.box;

describe('morphTransforms', () => {
  const t = morphTransforms(oldM, newM, oldBox, newBox)!;

  it('옛 그림은 제자리에서 출발한다', () => {
    expect(apply(t.old[0], { x: 0, y: 0 })).toEqual({ x: 628, y: 0 });
  });

  it('옛 그림의 이미지가 끝에서 새 이미지 자리에 겹친다', () => {
    // 옛 스냅샷 안 이미지 왼쪽 위(272, 48) → 그룹 기준 새 이미지 왼쪽 위(150, 16)
    const p = apply(t.old[1], { x: 272, y: 48 });
    expect(p.x).toBeCloseTo(150, 1);
    expect(p.y).toBeCloseTo(16, 1);
    // 이미지 오른쪽 아래도 맞는다(크기까지 같다)
    const q = apply(t.old[1], { x: 272 + 1124, y: 48 + 1600 });
    expect(q.x).toBeCloseTo(150 + 600, 0);
    expect(q.y).toBeCloseTo(16 + 854, 0);
  });

  it('새 그림의 이미지는 옛 이미지 자리에서 출발해 제자리로 온다', () => {
    const p = apply(t.new[0], { x: 150, y: 16 });
    expect(p.x).toBeCloseTo(628 + 272, 1);
    expect(p.y).toBeCloseTo(48, 1);
    expect(t.new[1]).toBe('translate(0px, 0px) scale(1)');
  });

  it('스냅샷 뒤 스크롤로 측정 상자가 달라져도 상자 안 상대 위치만 쓴다', () => {
    const scrolled: FigureMeasure = { box: { ...newM.box, y: newM.box.y - 500 }, img: { ...newM.img, y: newM.img.y - 500 } };
    expect(morphTransforms(oldM, scrolled, oldBox, newBox)).toEqual(t);
  });

  it('이미지 폭이 0이면(그림이 안 그려짐) 계산하지 않는다', () => {
    expect(morphTransforms({ ...oldM, img: { ...oldM.img, w: 0 } }, newM, oldBox, newBox)).toBeNull();
    expect(morphTransforms(oldM, { ...newM, img: { ...newM.img, w: 0 } }, oldBox, newBox)).toBeNull();
  });
});

describe('rectFromKeyframe', () => {
  it('matrix의 이동값과 폭·높이를 읽는다', () => {
    expect(rectFromKeyframe({ transform: 'matrix(1, 0, 0, 1, 628, 64)', width: '604px', height: '660px' })).toEqual({ x: 628, y: 64, w: 604, h: 660 });
  });

  it('transform이 none이면 원점이다', () => {
    expect(rectFromKeyframe({ transform: 'none', width: '10px', height: '20px' })).toEqual({ x: 0, y: 0, w: 10, h: 20 });
    expect(rectFromKeyframe({ width: '10px', height: '20px' })).toEqual({ x: 0, y: 0, w: 10, h: 20 });
  });

  it('읽을 수 없는 값은 null', () => {
    expect(rectFromKeyframe({ transform: 'matrix(1, 0, 0, 1, 628, 64)' })).toBeNull();
    expect(rectFromKeyframe({ transform: 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)', width: '1px', height: '1px' })).toBeNull();
    expect(rectFromKeyframe({ transform: 'matrix(1, 0, 0, 1, x, 64)', width: '1px', height: '1px' })).toBeNull();
    expect(rectFromKeyframe({ transform: 'matrix(1, 0, 0, 1)', width: '1px', height: '1px' })).toBeNull();
  });
});
