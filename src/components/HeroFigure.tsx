'use client';
// 홈 히어로 그림과 /about 그림판을 같은 이름(HERO_FIGURE)으로 묶어, 두 페이지를 오갈 때 캐릭터가 한 장처럼 이어서 움직이게 한다.
// children은 이름을 받을 상자 하나(data-hero-figure)이고 그 안에 캐릭터 <img>가 있어야 한다.
// 짝이 지어지면(onShare) 브라우저 기본 모핑(상자 크기 보간 + 동시 교차 페이드) 대신, 얼굴을 맞춘 두 그림을 함께 날린다(계산은 lib/hero-morph).
// 계산할 수 없으면 CSS 기본 전환(globals.css .figure-morph)이 그대로 돈다.
import { useLayoutEffect, ViewTransition, type ReactNode, type ViewTransitionInstance } from 'react';
import { HERO_FIGURE, HERO_FIGURE_SHARE } from '@/lib/page-transition';
import { HERO_MORPH, morphTransforms, rectFromKeyframe, type FigureMeasure, type Rect } from '@/lib/hero-morph';

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

function groupRects(instance: ViewTransitionInstance): [Rect, Rect] | null {
  const anim = instance.group.getAnimations()[0];
  const frames = (anim?.effect as KeyframeEffect | null)?.getKeyframes();
  if (!frames || frames.length < 2) return null;
  const from = rectFromKeyframe(frames[0]);
  const to = rectFromKeyframe(frames[frames.length - 1]);
  return from && to ? [from, to] : null;
}

function onShare(instance: ViewTransitionInstance) {
  const oldM = leaving;
  leaving = null;
  if (!oldM || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const newM = measure(document.querySelector(SELECTOR));
  const boxes = groupRects(instance);
  if (!newM || !boxes) return;
  const t = morphTransforms(oldM, newM, boxes[0], boxes[1]);
  if (!t) return;

  // 기본 모핑을 걷어 낸다. 그룹은 새 상자 자리에 멈춘다(UA가 끝 상태를 정적 스타일로 둔다)
  for (const part of [instance.group, instance.imagePair, instance.old, instance.new]) {
    for (const a of part.getAnimations()) a.cancel();
  }
  const timing = { duration: HERO_MORPH.duration, easing: HERO_MORPH.easing, fill: 'both' as const };
  const fade = { duration: HERO_MORPH.duration, easing: 'linear', fill: 'both' as const };
  const anims = [
    instance.old.animate({ transform: t.old }, timing),
    instance.new.animate({ transform: t.new }, timing),
    instance.old.animate([...HERO_MORPH.oldOpacity], fade),
    instance.new.animate([...HERO_MORPH.newOpacity], fade),
  ];

  // 새 본문(template page-in)은 캐릭터가 거의 도착할 때 들어오게 늦춘다. 짝이 지어진 이동에서만 바뀐다
  for (const a of document.documentElement.getAnimations({ subtree: true })) {
    if (a instanceof CSSAnimation && a.animationName === 'vtFadeUp') {
      a.effect?.updateTiming({ delay: HERO_MORPH.pageInDelay, duration: HERO_MORPH.pageInDuration });
    }
  }
  return () => anims.forEach((a) => a.cancel());
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
