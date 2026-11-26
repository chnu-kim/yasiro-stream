// 일지 보기: 기준 날짜(첫 플레이, 최근 플레이순이면 마지막 플레이) 월마다 배지(NOV / 2026)를 세우고, 한 줄에 날짜 · 탐험 번호 · 작은 표지 · 이름 · 결과 · 다시보기.
// 줄 전체가 상세를 여는 버튼이고(제목 버튼의 ::after가 줄을 덮는다), 다시보기 링크만 그 위에 올라온다.
// 이름순(월 묶음 없음)이면 months 대신 rows만 받아 날짜 칸에 전체 날짜를 적는다.
import { formatDate, sortDate } from '@/lib/games/query';
import type { SortKey } from '@/lib/games/types';
import { STATUS_TEXT } from '@/lib/games/labels';
import type { DiaryMonth } from '@/lib/games/years';
import type { BoardGame } from './boardTypes';
import styles from './DiaryList.module.css';

type Open = (game: BoardGame, trigger: HTMLButtonElement) => void;

export default function DiaryList({ months, flat, sort, onOpen }: { months?: DiaryMonth<BoardGame>[]; flat?: BoardGame[]; sort: SortKey; onOpen: Open }) {
  if (flat !== undefined) {
    return (
      <ol className={`${styles.rows} ${styles.flat}`}>
        {flat.map((game) => (
          <Row key={game.id} game={game} day={formatDate(sortDate(game, sort))} date={sortDate(game, sort)} wideDay onOpen={onOpen} />
        ))}
      </ol>
    );
  }
  return (
    <div className={styles.diary}>
      {months?.map((m) => (
        <section key={m.key} className={styles.month} aria-label={m.label}>
          <p className={styles.badge} aria-hidden="true">
            {m.kind === 'month' ? (
              <>
                <b>{m.month}</b>
                <span>{m.year}</span>
              </>
            ) : (
              <span className={styles.badgeNone}>날짜 없음</span>
            )}
          </p>
          <ol className={styles.rows}>
            {m.rows.map((r) => (
              <Row key={r.game.id} game={r.game} day={r.day} date={sortDate(r.game, sort)} onOpen={onOpen} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Row({ game, day, date, wideDay = false, onOpen }: { game: BoardGame; day: string | null; date: string | null; wideDay?: boolean; onOpen: Open }) {
  const vod = game.vods[0];
  return (
    <li className={game.hidden ? `${styles.row} ${styles.isHidden}` : styles.row}>
      <span className={wideDay ? `${styles.day} ${styles.dayWide}` : styles.day} aria-hidden="true">
        {day}
      </span>
      <span className={styles.no} aria-hidden="true">{game.no}</span>
      <span className={styles.thumb} aria-hidden="true">
        {game.posterUrl !== undefined && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.posterUrl} alt="" width={60} height={80} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        )}
      </span>
      <span className={styles.nameCell}>
        <h3 className={styles.name}>
          <button
            type="button"
            className={styles.open}
            aria-haspopup="dialog"
            data-game-id={game.id}
            data-role="open"
            onClick={(e) => onOpen(game, e.currentTarget)}
          >
            {game.name}
            <span className={styles.srOnly}>
              , NO.{game.no}, {formatDate(date)}, {STATUS_TEXT[game.status]}
            </span>
          </button>
        </h3>
        {game.originalTitle && (
          <span lang="en" className={styles.orig} aria-hidden="true">
            {game.originalTitle}
          </span>
        )}
      </span>
      <span className={styles.status} data-status={game.status} aria-hidden="true">
        {game.status === 'unknown' ? '—' : STATUS_TEXT[game.status]}
      </span>
      {vod !== undefined ? (
        <a className={styles.vod} href={vod.url} target="_blank" rel="noreferrer" aria-label={`${game.name} 다시보기 (새 탭에서 열림)`}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
          </svg>
          <span className={styles.vodText}>다시보기{game.vods.length > 1 ? ` ${game.vods.length}` : ''}</span>
        </a>
      ) : (
        <span className={styles.noVod} aria-hidden="true">—</span>
      )}
    </li>
  );
}
