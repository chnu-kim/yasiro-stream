// 사이트 안 페이지 이동 링크에 붙이는 transition type. layout의 <ViewTransition>이 이 타입일 때만 본문을 바꿔 그린다.
// 게임 필터·페이지 번호처럼 같은 페이지 안의 URL 변경에는 붙이지 않는다(움직이지 않는다).
export const PAGE_TRANSITION = ['page'];

// 홈 히어로 그림과 /about 그림판이 같은 이름을 가져, 두 페이지를 오갈 때 캐릭터가 이어서 움직인다(shared element).
// 'page' 타입 이동에서만 짝을 짓는다(뒤로 가기·첫 로드는 그대로). 한쪽이 화면 밖이면 React가 짝을 짓지 않고 본문 전환만 한다.
export const HERO_FIGURE = 'yasiro-figure';
export const HERO_FIGURE_SHARE = { page: 'figure-morph', default: 'none' };

// 이 클릭이 사이트 안 다른 페이지로 떠나는 링크 클릭인가(새 탭·다운로드·바깥 주소·같은 페이지 앵커는 아니다).
// /about은 이때 그림판의 눈금자·장비 라벨을 숨겨, 전환 스냅샷에 라벨이 찍혀 캐릭터와 함께 커지지 않게 한다.
export type ClickLike = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean };
export type AnchorLike = { href: string; target: string; download: boolean };

export function leavesPage(click: ClickLike, anchor: AnchorLike | null, here: string): boolean {
  if (!anchor || click.button !== 0) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if ((anchor.target && anchor.target !== '_self') || anchor.download) return false;
  const from = new URL(here);
  const to = new URL(anchor.href, from);
  return to.origin === from.origin && to.pathname !== from.pathname;
}
