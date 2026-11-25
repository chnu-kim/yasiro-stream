import { describe, expect, it } from 'vitest';
import { HERO_FIGURE_SHARE, PAGE_TRANSITION, VT_LAYERS, VT_MAX_STEP, vtTarget } from './page-transition';

describe('PAGE_TRANSITION', () => {
  it("template의 <ViewTransition>이 기다리는 'page' 타입 하나만 붙인다", () => {
    expect(PAGE_TRANSITION).toEqual(['page']);
  });
});

describe('HERO_FIGURE_SHARE', () => {
  it("'page' 이동에서만 그림을 이어 붙이고 나머지(뒤로 가기 등)는 움직이지 않는다", () => {
    expect(HERO_FIGURE_SHARE).toEqual({ page: 'figure-morph', default: 'none' });
    expect(Object.keys(HERO_FIGURE_SHARE)).toContain(PAGE_TRANSITION[0]);
  });
});


describe('vtTarget', () => {
  it('이름과 레이어·순서를 CSS 변수로 넘긴다(globals.css [data-vt]가 읽는다)', () => {
    expect(vtTarget('home-head', 'rise', 2)).toEqual({ 'data-vt': '', style: { '--vt': 'home-head', '--vt-class': 'vt-rise vt-rise-2' } });
    expect(vtTarget('about-band', 'band')).toEqual({ 'data-vt': '', style: { '--vt': 'about-band', '--vt-class': 'vt-band vt-band-0' } });
  });

  it('레이어는 globals.css가 아는 네 가지', () => {
    expect(VT_LAYERS).toEqual(['rise', 'band', 'label', 'stamp']);
  });

  it('CSS 식별자로 쓸 수 없는 이름, 범위 밖 순서는 거부한다', () => {
    for (const bad of ['', 'Home', '1st', 'a b', 'a_b', 'a;b']) expect(() => vtTarget(bad, 'rise')).toThrow();
    for (const step of [-1, VT_MAX_STEP + 1, 1.5]) expect(() => vtTarget('a', 'rise', step)).toThrow();
    expect(() => vtTarget('a', 'rise', VT_MAX_STEP)).not.toThrow();
  });
});
