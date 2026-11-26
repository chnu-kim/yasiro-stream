import type { CSSProperties } from 'react';

// 사이트 안 페이지 이동 링크에 붙이는 transition type. template.tsx의 <ViewTransition>이 이 타입일 때만 본문을 바꿔 그린다.
// 게임 필터·정렬처럼 같은 페이지 안의 URL 변경에는 붙이지 않는다(움직이지 않는다).
export const PAGE_TRANSITION = ['page'];

// 홈 히어로 그림과 /about 그림판이 같은 이름을 가져, 두 페이지를 오갈 때 캐릭터가 이어서 움직인다(shared element).
// 'page' 타입 이동에서만 짝을 짓는다(뒤로 가기·첫 로드는 그대로). 한쪽이 화면 밖이면 React가 짝을 짓지 않고 본문 전환만 한다.
export const HERO_FIGURE = 'yasiro-figure';
export const HERO_FIGURE_SHARE = { page: 'figure-morph', default: 'none' };


// 페이지 이동 중에만 따로 움직이는 요소(전환 레이어). globals.css의 [data-vt] 규칙이 'page' 이동 동안
// view-transition-name = --vt, view-transition-class = --vt-class로 붙인다. CSS Modules가 이름을 해시하지 않게 변수로 넘긴다.
//  - rise: 제목·문구가 차례로 떠오른다(step 0부터 60ms 간격), 떠날 때는 짧게 올라가며 사라진다
//  - band: /about 사선 띠가 들어올 때 쓸며 그려지고, 떠날 때는 본문과 함께 흐려진다
//  - label: /about 눈금자·장비 라벨. 띠 뒤에 나타난다(캐릭터 위 층)
//  - stamp: /about 도장. 캐릭터가 도착할 즈음 찍힌다
export const VT_LAYERS = ['rise', 'band', 'label', 'stamp'] as const;
export type VtLayer = (typeof VT_LAYERS)[number];
export const VT_MAX_STEP = 3;

export function vtTarget(name: string, layer: VtLayer, step = 0): { 'data-vt': ''; style: CSSProperties } {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`전환 이름은 소문자·숫자·하이픈만: ${name}`);
  if (!Number.isInteger(step) || step < 0 || step > VT_MAX_STEP) throw new Error(`step은 0~${VT_MAX_STEP}: ${step}`);
  return { 'data-vt': '', style: { '--vt': name, '--vt-class': `vt-${layer} vt-${layer}-${step}` } as CSSProperties };
}
