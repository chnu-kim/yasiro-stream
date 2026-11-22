import Link from 'next/link';
import Button from '@/components/Button';
import SectionLabel from '@/components/SectionLabel';
import { emptyRankingText, rankingStatsText, RANKINGS_FAILURE_TEXT, runsSummaryText, winRateNote } from '@/lib/awards/client';
import { DIVISIONS, DIVISION_LABEL, rankingsHref } from '@/lib/awards/entries';
import { RANKINGS_PAGE_TITLE } from '@/lib/awards/labels';
import type { Rankings, TallyRow } from '@/lib/awards/rankings';
import type { AwardEntry, Division } from '@/lib/awards/types';
import RankThumb from '../RankThumb';
import styles from '../awards.module.css';

// 집계 순위(서버 렌더). 부문 전환은 ?division= 링크라 새로고침·공유해도 같은 부문이 열린다.
// rankings null = 순위를 읽지 못함(0013 미적용 등). 다시 읽으려면 페이지를 새로 연다.
export default function RankingsView({
  division,
  rankings,
  entries,
}: {
  division: Division;
  rankings: Rankings | null;
  entries: readonly AwardEntry[];
}) {
  const byId = new Map(entries.map((e) => [e.id, e]));

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <SectionLabel>RANKING</SectionLabel>
        <h1 className={styles.title}>{RANKINGS_PAGE_TITLE}</h1>
        {rankings !== null && <p className={styles.lead}>{runsSummaryText(rankings.runs)}</p>}
      </header>

      <nav aria-label="부문" className={styles.rankDivision}>
        <ul className={styles.choices}>
          {DIVISIONS.map((d) => (
            <li key={d}>
              <Link
                href={rankingsHref(d)}
                replace
                scroll={false}
                aria-current={d === division ? 'page' : undefined}
                className={styles.divisionLink}
              >
                {DIVISION_LABEL[d]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {rankings === null ? (
        <p role="alert" className={styles.note} style={{ marginTop: 'var(--space-5)' }}>
          {RANKINGS_FAILURE_TEXT}
        </p>
      ) : (
        <>
          <RankSection title="우승 횟수" rows={rankings.byChampionships} byId={byId} empty={emptyRankingText(rankings.runs, 'championships')} />
          <RankSection
            title="승률"
            rows={rankings.byWinRate}
            byId={byId}
            empty={emptyRankingText(rankings.runs, 'winRate')}
            note={winRateNote(rankings.minMatches)}
          />
        </>
      )}

      <div className={styles.actions}>
        <Button href="/awards" variant="primary" size="lg">
          어워즈로 돌아가기
        </Button>
      </div>
    </div>
  );
}

function RankSection({
  title,
  rows,
  byId,
  empty,
  note,
}: {
  title: string;
  rows: readonly TallyRow[];
  byId: ReadonlyMap<string, AwardEntry>;
  empty: string;
  note?: string;
}) {
  // entries에 없는 게임(순위를 읽은 뒤 숨긴 게임 등)은 그리지 않는다
  const shown = rows.flatMap((r) => {
    const entry = byId.get(r.id);
    return entry === undefined ? [] : [{ row: r, entry }];
  });
  return (
    <section className={styles.rankSection}>
      <h2 className={styles.rankSectionTitle}>{title}</h2>
      {shown.length === 0 ? (
        <p className={styles.note}>{empty}</p>
      ) : (
        <ol className={styles.rankList}>
          {shown.map(({ row, entry }, i) => (
            <li key={row.id} className={styles.rankRow}>
              <span className={styles.rankNo}>{i + 1}</span>
              <RankThumb entry={entry} />
              <span className={styles.rankText}>
                <span className={styles.rankName}>{entry.name}</span>
                <span className={styles.rankLabel}>{rankingStatsText(row)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {note !== undefined && <p className={styles.note}>{note}</p>}
    </section>
  );
}
