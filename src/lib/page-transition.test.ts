import { describe, expect, it } from 'vitest';
import { HERO_FIGURE_SHARE, leavesPage, PAGE_TRANSITION } from './page-transition';

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

describe('leavesPage', () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  const a = (href: string, target = '', download = false) => ({ href, target, download });
  const here = 'https://yasiro.stream/about';

  it('사이트 안 다른 페이지 링크를 그냥 누르면 떠난다', () => {
    expect(leavesPage(click, a('https://yasiro.stream/'), here)).toBe(true);
    expect(leavesPage(click, a('/games?q=1'), here)).toBe(true);
  });

  it('링크가 아니거나, 같은 페이지·바깥 주소면 떠나지 않는다', () => {
    expect(leavesPage(click, null, here)).toBe(false);
    expect(leavesPage(click, a('https://yasiro.stream/about#profile'), here)).toBe(false);
    expect(leavesPage(click, a('https://chzzk.naver.com/live/x'), here)).toBe(false);
  });

  it('새 탭·다운로드·보조 버튼·보조 키 클릭은 떠나지 않는다', () => {
    expect(leavesPage(click, a('/', '_blank'), here)).toBe(false);
    expect(leavesPage(click, a('/', '_self'), here)).toBe(true);
    expect(leavesPage(click, a('/', '', true), here)).toBe(false);
    expect(leavesPage({ ...click, button: 1 }, a('/'), here)).toBe(false);
    for (const k of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) {
      expect(leavesPage({ ...click, [k]: true }, a('/'), here)).toBe(false);
    }
  });
});
