import { describe, expect, it } from 'vitest';
import { HERO_FIGURE_SHARE, PAGE_TRANSITION } from './page-transition';

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
