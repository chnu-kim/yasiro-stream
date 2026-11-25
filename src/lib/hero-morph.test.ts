import { describe, expect, it } from 'vitest';
import { groupRects, HERO_MORPH, morphTransforms, rectFromKeyframe, runHeroMorph, shiftEnters, type FigureMeasure, type Rect } from './hero-morph';

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

// ── runHeroMorph: Web Animations를 기록하는 가짜 pseudo ──
type Call = { keyframes: unknown; options: KeyframeAnimationOptions; canceled: boolean };
function fakePseudo(frames?: Array<Record<string, unknown>> | null) {
  const calls: Call[] = [];
  const existing = { canceled: false, cancel() { this.canceled = true; }, effect: frames === undefined ? null : frames === null ? null : { getKeyframes: () => frames } };
  const pseudo = {
    calls,
    existing,
    animate(keyframes: unknown, options: KeyframeAnimationOptions) {
      const c: Call = { keyframes, options, canceled: false };
      calls.push(c);
      return { cancel: () => { c.canceled = true; } };
    },
    getAnimations: () => [existing],
  };
  return pseudo;
}
const UA_FRAMES = [
  { transform: 'matrix(1, 0, 0, 1, 628, 64)', width: '604px', height: '660px' },
  { transform: 'matrix(1, 0, 0, 1, 0, 64)', width: '630px', height: '672px' },
];
function instance(frames: Array<Record<string, unknown>> | null | undefined = UA_FRAMES) {
  return { name: 'yasiro-figure', group: fakePseudo(frames), imagePair: fakePseudo(), old: fakePseudo(), new: fakePseudo() };
}
function docAnim(pseudo: string | null, delay: number) {
  const a = { pseudo, delay, set: [] as number[], setDelay: (ms: number) => a.set.push(ms) };
  return a;
}

describe('groupRects', () => {
  it('UA 그룹 키프레임의 처음·끝을 옛·새 상자로 읽는다', () => {
    expect(groupRects(fakePseudo(UA_FRAMES))).toEqual([
      { x: 628, y: 64, w: 604, h: 660 },
      { x: 0, y: 64, w: 630, h: 672 },
    ]);
  });

  it('애니메이션·키프레임이 없거나 모자라거나 읽을 수 없으면 null', () => {
    expect(groupRects({ ...fakePseudo(), getAnimations: () => [] })).toBeNull();
    expect(groupRects(fakePseudo(null))).toBeNull();
    expect(groupRects(fakePseudo([UA_FRAMES[0]]))).toBeNull();
    expect(groupRects(fakePseudo([{ width: 'x' }, UA_FRAMES[1]]))).toBeNull();
    expect(groupRects(fakePseudo([UA_FRAMES[0], { width: 'x' }]))).toBeNull();
  });
});

describe('shiftEnters', () => {
  it('새 페이지 등장(::view-transition-new)만, 캐릭터 자신은 빼고 늦춘다', () => {
    const page = docAnim('::view-transition-new(_t_1_)', 80);
    const title = docAnim('::view-transition-new(about-name)', 140);
    const figure = docAnim('::view-transition-new(yasiro-figure)', 0);
    const exit = docAnim('::view-transition-old(_t_0_)', 0);
    const plain = docAnim(null, 120);
    expect(shiftEnters([page, title, figure, exit, plain], 'yasiro-figure', 60)).toBe(2);
    expect(page.set).toEqual([140]);
    expect(title.set).toEqual([200]);
    expect([figure.set, exit.set, plain.set]).toEqual([[], [], []]);
  });
});

describe('runHeroMorph', () => {
  const run = (over: Partial<Parameters<typeof runHeroMorph>[0]> = {}) => {
    const inst = instance();
    const page = docAnim('::view-transition-new(_t_1_)', 80);
    const cleanup = runHeroMorph({ instance: inst, oldM, newM, reducedMotion: false, docAnimations: () => [page], ...over });
    return { inst: (over.instance as ReturnType<typeof instance>) ?? inst, page, cleanup };
  };

  it('기본 모핑을 걷어 내고 옛·새 그림에 이동·투명도 애니메이션을 건 뒤 새 페이지 등장을 늦춘다', () => {
    const { inst, page, cleanup } = run();
    for (const p of [inst.group, inst.imagePair, inst.old, inst.new]) expect(p.existing.canceled).toBe(true);
    expect(inst.old.calls).toHaveLength(2);
    expect(inst.new.calls).toHaveLength(2);
    const t = morphTransforms(oldM, newM, oldBox, newBox)!;
    expect(inst.old.calls[0].keyframes).toEqual({ transform: t.old });
    expect(inst.new.calls[0].keyframes).toEqual({ transform: t.new });
    expect(inst.old.calls[0].options).toMatchObject({ duration: HERO_MORPH.duration, fill: 'both' });
    expect(page.set).toEqual([80 + HERO_MORPH.enterShift]);

    cleanup!();
    expect([...inst.old.calls, ...inst.new.calls].every((c) => c.canceled)).toBe(true);
  });

  it('모션 줄이기·측정 실패·그룹 키프레임 없음·이미지 폭 0이면 아무것도 바꾸지 않는다', () => {
    const cases: Array<Partial<Parameters<typeof runHeroMorph>[0]>> = [
      { reducedMotion: true },
      { oldM: null },
      { newM: null },
      { instance: instance(null) },
      { newM: { ...newM, img: { ...newM.img, w: 0 } } },
    ];
    for (const c of cases) {
      const { inst, page, cleanup } = run(c);
      expect(cleanup).toBeNull();
      expect(inst.group.existing.canceled).toBe(false);
      expect(inst.old.calls).toEqual([]);
      expect(page.set).toEqual([]);
    }
  });
});
