import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadAwardsPage, type AwardsPageResult } from '@/lib/awards/api';
import { toAwardEntries } from '@/lib/awards/entries';
import { PAGE_TITLE } from '@/lib/awards/labels';
import { getAwardsDeps } from '../api/awards/_deps';
import AwardsApp from './AwardsApp';
import styles from './page.module.css';

// 관리자 전용. 레이아웃 template이 " | 야시로 팬사이트"를 붙인다. pageMetadata는 canonical·og:url을 만들어 쓰지 않는다.
export const metadata: Metadata = {
  title: PAGE_TITLE,
  robots: { index: false, follow: false },
};

// 권한이 없거나(AWARDS_PUBLIC = false면 관리자만) D1을 못 읽으면(pnpm dev 포함) 404. notFound()는 던져서 동작하므로 try 밖에서 부른다.
export default async function AwardsPage() {
  let result: AwardsPageResult;
  try {
    result = await loadAwardsPage(await getAwardsDeps(), (await headers()).get('cookie'));
  } catch {
    result = { kind: 'error' };
  }
  if (result.kind !== 'ok') notFound();

  return (
    <div className={styles.page}>
      <AwardsApp entries={toAwardEntries(result.games)} />
    </div>
  );
}
