import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { loadGamesPageData } from '@/lib/games/api';
import type { GamesPageData } from '@/lib/games/types';
import { getGamesDeps } from '../api/games/_deps';
import GamesBoard from './GamesBoard';
import styles from './page.module.css';

export const metadata: Metadata = pageMetadata({
  path: '/games',
  title: '플레이한 게임',
  description: '야시로가 방송에서 탐험한 게임 행성들의 기록. 첫 플레이 날짜, 정복 여부, 다시보기를 모았어요.',
});

// 정본은 D1(games, game_vods)이다. D1이 없거나(pnpm dev) 조회가 실패하면 ok:false로 보드 자리에 안내를 띄운다.
export default async function GamesPage() {
  let data: GamesPageData;
  try {
    const deps = await getGamesDeps();
    data = await loadGamesPageData(deps, (await headers()).get('cookie'));
  } catch {
    data = { ok: false };
  }

  return (
    <div className={styles.page}>
      {/* Suspense 경계로 감싸지 않는다. useSearchParams 때문에 경계가 필요한 것은 미리 렌더링되는 페이지뿐이고, 이 페이지는 headers()를 읽는
          동적 페이지다. 경계가 있으면 사이트 안에서 이동해 올 때 보드가 준비되기 전에 빈 칸(fallback)이 먼저 붙어, 페이지 전환이 빈 화면을
          찍고 보드는 전환이 끝난 뒤 툭 나타났다. 경계가 없으면 이동이 보드가 준비될 때까지 이전 화면을 유지한다 */}
      <GamesBoard data={data} />
    </div>
  );
}
