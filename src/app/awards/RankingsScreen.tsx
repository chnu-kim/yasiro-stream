import { useEffect, useState, type Ref } from 'react';
import Button from '@/components/Button';
import SectionLabel from '@/components/SectionLabel';
import {
  classifyRankings,
  emptyRankingText,
  rankingStatsText,
  rankingsFailureMessage,
  RANKINGS_LOADING_TEXT,
  runsSummaryText,
  winRateNote,
  type RankingsOutcome,
} from '@/lib/awards/client';
import { DIVISIONS, DIVISION_LABEL } from '@/lib/awards/entries';
import type { TallyRow } from '@/lib/awards/rankings';
import type { AwardEntry, Division } from '@/lib/awards/types';
import { awardsApi } from './awardsApi';
import RankThumb from './RankThumb';
import styles from './awards.module.css';

type Slot = RankingsOutcome;

// 집계 순위 화면. 부문마다 처음 열 때 API로 읽고(이 화면이 열려 있는 동안만 보관), 실패하면 다시 불러오기 버튼을 보인다.
export default function RankingsScreen({
  initialDivision,
  byId,
  headingRef,
  onBack,
}: {
  initialDivision: Division;
  byId: ReadonlyMap<string, AwardEntry>;
  headingRef: Ref<HTMLHeadingElement>;
  onBack: () => void;
}) {
  const [division, setDivision] = useState<Division>(initialDivision);
  const [slots, setSlots] = useState<Partial<Record<Division, Slot>>>({});
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    awardsApi.rankings(division).then((r) => {
      if (live) setSlots((cur) => ({ ...cur, [division]: classifyRankings(r.status, r.body) }));
    });
    return () => {
      live = false;
    };
  }, [division, reload]);

  // 값이 없으면 불러오는 중
  const slot = slots[division] ?? null;

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <SectionLabel>RANKING</SectionLabel>
        <h2 ref={headingRef} tabIndex={-1} className={styles.title}>
          집계 순위
        </h2>
        {slot?.ok && <p className={styles.lead}>{runsSummaryText(slot.data.runs)}</p>}
      </header>

      <fieldset className={styles.rankDivision}>
        <legend className={styles.srOnly}>부문</legend>
        <div className={styles.choices}>
          {DIVISIONS.map((d) => (
            <label key={d} className={styles.choice}>
              <input type="radio" name="rank-division" value={d} checked={division === d} onChange={() => setDivision(d)} />
              <span className={styles.choiceText}>{DIVISION_LABEL[d]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div aria-live="polite">
        {slot === null && <p className={styles.note}>{RANKINGS_LOADING_TEXT}</p>}
        {slot !== null && !slot.ok && (
          <div className={styles.rankFail}>
            <p role="alert" className={styles.note}>
              {rankingsFailureMessage(slot.reason)}
            </p>
            <Button variant="secondary" onClick={() => {
                setSlots((cur) => ({ ...cur, [division]: undefined }));
                setReload((n) => n + 1);
              }}>
              다시 불러오기
            </Button>
          </div>
        )}
        {slot?.ok && (
          <>
            <RankSection title="우승 횟수" rows={slot.data.byChampionships} byId={byId} empty={emptyRankingText(slot.data.runs, 'championships')} />
            <RankSection
              title="승률"
              rows={slot.data.byWinRate}
              byId={byId}
              empty={emptyRankingText(slot.data.runs, 'winRate')}
              note={winRateNote(slot.data.minMatches)}
            />
          </>
        )}
      </div>

      <div className={styles.actions}>
        <Button variant="primary" size="lg" onClick={onBack}>
          돌아가기
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
  // 화면이 모르는 게임(대진 이후 새로 생긴 게임)은 그리지 않는다
  const shown = rows.flatMap((r) => {
    const entry = byId.get(r.id);
    return entry === undefined ? [] : [{ row: r, entry }];
  });
  return (
    <section className={styles.rankSection}>
      <h3 className={styles.rankSectionTitle}>{title}</h3>
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
