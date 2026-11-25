'use client';
// 홈 히어로 그림과 /about 그림판을 같은 이름(HERO_FIGURE)으로 묶어, 두 페이지를 오갈 때 캐릭터가 한 장처럼 이어서 움직이게 한다.
// children은 이름을 받을 상자 하나(data-hero-figure)이고 그 안에 캐릭터 <img>가 있어야 한다.
// 짝이 지어지면(onShare) 측정값만 모아 lib/hero-morph runHeroMorph에 넘긴다(얼굴 맞춘 이동·새 페이지 등장 늦추기).
// 계산할 수 없으면 CSS 기본 전환(globals.css .figure-morph)이 그대로 돈다.
import { useLayoutEffect, ViewTransition, type ReactNode, type ViewTransitionInstance } from 'react';
import { HERO_FIGURE, HERO_FIGURE_SHARE } from '@/lib/page-transition';
import { runHeroMorph, type DocAnimation, type FigureMeasure, type MorphInstance, type Rect } from '@/lib/hero-morph';

const SELECTOR = '[data-hero-figure]';

// 떠나는 페이지의 그림 측정값. 언마운트 직전(스냅샷과 같은 레이아웃)에 적고, 짝이 지어지면 한 번 쓰고 비운다
let leaving: FigureMeasure | null = null;

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function measure(box: Element | null): FigureMeasure | null {
  const img = box?.querySelector('img');
  if (!box || !img) return null;
  return { box: rectOf(box), img: rectOf(img) };
}

function docAnimations(): DocAnimation[] {
  return document.documentElement
    .getAnimations({ subtree: true })
    .filter((a): a is CSSAnimation => a instanceof CSSAnimation)
    .map((a) => {
      const effect = a.effect as KeyframeEffect | null;
      return {
        pseudo: effect?.pseudoElement ?? null,
        delay: Number(effect?.getTiming().delay ?? 0),
        setDelay: (ms: number) => effect?.updateTiming({ delay: ms }),
      };
    });
}

function onShare(instance: ViewTransitionInstance) {
  const oldM = leaving;
  leaving = null;
  return (
    runHeroMorph({
      instance: instance as unknown as MorphInstance,
      oldM,
      newM: measure(document.querySelector(SELECTOR)),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      docAnimations,
    }) ?? undefined
  );
}

export default function HeroFigure({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const box = document.querySelector(SELECTOR);
    return () => {
      leaving = measure(box);
    };
  }, []);

  return (
    <ViewTransition name={HERO_FIGURE} share={HERO_FIGURE_SHARE} default="none" onShare={onShare}>
      {children}
    </ViewTransition>
  );
}
