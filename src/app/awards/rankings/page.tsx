import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadAwardsRankingsPage, type AwardsRankingsPageResult } from '@/lib/awards/api';
import { parseDivisionQuery } from '@/lib/awards/entries';
import { RANKINGS_PAGE_TITLE } from '@/lib/awards/labels';
import { getAwardsDeps } from '../../api/awards/_deps';
import RankingsView from './RankingsView';
import styles from '../page.module.css';

// /awards와 같은 게이트(관리자 전용, noindex, Nav·sitemap 미등록). pageMetadata는 canonical·og:url을 만들어 쓰지 않는다.
export const metadata: Metadata = {
  title: RANKINGS_PAGE_TITLE,
  robots: { index: false, follow: false },
};

// 권한이 없거나 게임을 못 읽으면 404. 순위만 못 읽으면 페이지는 열고 실패 문구를 보인다. notFound()는 try 밖에서 부른다.
export default async function AwardsRankingsPage({ searchParams }: PageProps<'/awards/rankings'>) {
  const division = parseDivisionQuery((await searchParams).division);
  let result: AwardsRankingsPageResult;
  try {
    result = await loadAwardsRankingsPage(await getAwardsDeps(), (await headers()).get('cookie'), division);
  } catch {
    result = { kind: 'error' };
  }
  if (result.kind !== 'ok') notFound();

  return (
    <div className={styles.page}>
      <RankingsView division={result.division} rankings={result.rankings} entries={result.entries} />
    </div>
  );
}
