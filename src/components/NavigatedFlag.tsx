'use client';
// 사이트 안에서 페이지를 한 번이라도 옮기면 <html data-navigated>를 붙인다(template이 경로마다 다시 붙이므로 두 번째 마운트부터).
// 첫 로드용 진입 애니메이션(홈 히어로 heroIn 등)은 html:not([data-navigated])에서만 돈다. 페이지를 옮겨 들어올 때는
// 페이지 전환(globals.css 전환 레이어)이 등장을 맡으므로, 두 애니메이션이 겹쳐 한 번 더 흐려졌다 떠오르지 않게 한다.
// 개발 모드 StrictMode의 재마운트는 같은 주소라 세지 않는다.
import { useLayoutEffect } from 'react';

let firstHref: string | null = null;

export default function NavigatedFlag() {
  useLayoutEffect(() => {
    if (firstHref === null) firstHref = location.href;
    else if (location.href !== firstHref) document.documentElement.setAttribute('data-navigated', '');
  }, []);
  return null;
}
