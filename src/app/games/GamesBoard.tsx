'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import SectionLabel from '@/components/SectionLabel';
import {
  applyFilterChange,
  countStats,
  detailQuery,
  indexGames,
  indexWithHidden,
  normalizeQ,
  parseDetailId,
  parseQueryState,
  parseSortKey,
  Q_MAX,
  selectGames,
  serializeQueryState,
  SORT_KEYS,
  STATUS_FILTERS,
  statusCounts,
  VIEW_KEYS,
} from '@/lib/games/query';
import {
  describeConditions,
  hasActiveFilter,
  hasFilterSelection,
  resultSummary,
  SORT_LABEL,
  chapterAxisLabel,
  STATUS_FILTER_LABEL,
  VIEW_LABEL,
} from '@/lib/games/labels';
import { diaryMonths, yearChapters } from '@/lib/games/years';
import { SEEN_STATS_KEY, serializeSeenStats } from '@/lib/games/seen-stats';
import { addedMessage, errorMessage, hiddenMessage, savedMessage, unhiddenMessage } from '@/lib/games/client';
import type { GamesPageData, GamesQueryState, GameRecord } from '@/lib/games/types';
import { adminApi } from './adminApi';
import AddGameFlow from './AddGameFlow';
import AdminBar from './AdminBar';
import type { AdminGame, BoardGame } from './boardTypes';
import GameCard from './GameCard';
import DiaryList from './DiaryList';
import GameDetailDialog, { type AdminDetailContext } from './GameDetailDialog';
import Toast, { type ToastState } from './Toast';
import { useChapterSpy } from './useChapterSpy';
import styles from './page.module.css';

// 목록 상태(q, status, year, sort, page)의 정본은 URL이다. useSearchParams로 읽고
// history.pushState/replaceState로 쓴다(Next가 둘을 라우터와 동기화한다).
// 검색 입력은 타이핑마다 replaceState(히스토리 오염 방지), 필터·정렬·보기는 pushState.
// 목록은 페이지로 나누지 않고 정렬 기준 날짜(첫 플레이, 최근 플레이순이면 마지막 플레이)의 연도 챕터로 묶는다. 연도 목차는 스크롤만 하고 URL을 바꾸지 않는다.
// 상세를 열며 쌓은 history 항목 표식. Next는 pushState data의 사용자 키를 보존한다.
const DETAIL_ENTRY = 'yasiroGameDetail';

const TOAST_MS = 6000;

function isWrite(v: unknown): v is { game: GameRecord } {
  const g = (v as { game?: GameRecord } | null)?.game;
  return typeof g === 'object' && g !== null && typeof g.id === 'string' && typeof g.version === 'number';
}

// D1이 없거나(pnpm dev) 조회가 실패한 경우. 빈 목록 "0개"로 보이지 않게 따로 안내한다.
export default function GamesBoard({ data }: { data: GamesPageData }) {
  if (!data.ok) {
    return (
      <section className={`${styles.header} ${styles.failed}`} aria-labelledby="games-title">
        <div className={styles.headerText}>
          <SectionLabel style={{ marginBottom: 0 }}>EXPEDITION LOG</SectionLabel>
          <h1 id="games-title" className={styles.title}>플레이한 게임</h1>
          <p role="alert" className={styles.loadError}>기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
        </div>
      </section>
    );
  }
  return <Board data={data} />;
}

function Board({ data }: { data: Extract<GamesPageData, { ok: true }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isAdmin = data.admin !== null;

  // 관리자는 저장·숨김 직후 목록이 바로 바뀌도록 레코드를 상태로 들고, 서버가 새 props를 주면 따라간다.
  const [records, setRecords] = useState<GameRecord[]>(data.admin === null ? [] : data.games);
  const [syncedData, setSyncedData] = useState(data);
  if (data !== syncedData) {
    setSyncedData(data);
    setRecords(data.admin === null ? [] : data.games);
  }
  const [showHidden, setShowHidden] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editFor, setEditFor] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  // 마우스·포커스가 알림 위에 있는 동안은 자동으로 닫지 않는다
  const [toastHeld, setToastHeld] = useState(false);
  const toastSeq = useRef(0);
  const toastActionRef = useRef<HTMLButtonElement>(null);
  // 상세에서 숨긴 직후 닫히면 포커스를 카드 대신 알림의 "되돌리기"로 보낸다
  const focusUndoRef = useRef(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const wasAdding = useRef(false);

  const state = useMemo(() => parseQueryState(searchParams), [searchParams]);
  // 숨기지 않은 게임만 번호를 매긴다. 숨긴 게임(관리자)은 "—"
  const list = useMemo<BoardGame[]>(
    () => (data.admin === null ? indexGames(data.games).map((g) => ({ ...g, hidden: false })) : indexWithHidden(records)),
    [data, records],
  );
  const visible = useMemo(() => list.filter((g) => !g.hidden), [list]);
  const hiddenCount = list.length - visible.length;
  const source = isAdmin && showHidden ? list : visible;
  const stats = useMemo(() => countStats(visible), [visible]);
  // 지금 본 숫자를 기억한다. html의 --seen-*는 올라가는 애니메이션이 끝난 뒤에 맞춰서,
  // 다른 페이지에 갔다가 돌아와도(클라이언트 이동) 같은 상승을 다시 보여 주지 않는다
  useEffect(() => {
    try {
      localStorage.setItem(SEEN_STATS_KEY, serializeSeenStats(stats));
    } catch {
      // 저장소를 못 쓰면 다음에도 정지 상태로 보일 뿐이다
    }
    window.setTimeout(() => {
      const root = document.documentElement.style;
      root.setProperty('--seen-total', String(stats.total));
      root.setProperty('--seen-clear', String(stats.clear));
    }, 1500);
  }, [stats]);
  const results = useMemo(() => selectGames(source, state), [source, state]);
  const resultClear = useMemo(() => results.filter((g) => g.status === 'clear').length, [results]);
  const counts = useMemo(() => statusCounts(source, state), [source, state]);
  // 날짜순이면 결과 전체를 기준 날짜(sortDate)의 연도 챕터로 나눈다(이름순은 null). 숨김 보기에서는 숨긴 게임도 센다
  const chapters = useMemo(() => yearChapters(results, state), [results, state]);
  const chapterKeys = useMemo(() => (chapters ?? []).map((c) => c.key), [chapters]);
  const spy = useChapterSpy(chapterKeys);

  useEffect(() => {
    if (toast === null || toastHeld) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast, toastHeld]);
  const showToast = (message: string, action?: ToastState['action']) => {
    setToastHeld(false);
    setToast({ id: ++toastSeq.current, message, action });
  };
  const dismissToast = () => {
    setToastHeld(false);
    setToast(null);
  };

  // 입력 중인 값(공백 포함)은 로컬로 들고, URL이 바깥에서 바뀌면(뒤로가기·초기화) 따라간다.
  const [typed, setTyped] = useState(state.q);
  const [syncedQ, setSyncedQ] = useState(state.q);
  if (state.q !== syncedQ) {
    setSyncedQ(state.q);
    if (normalizeQ(typed) !== state.q) setTyped(state.q);
  }

  // 상세도 URL(`game` 파라미터)이 정본이다. 열 때 pushState로 기록을 하나 쌓아서
  // 뒤로가기(모바일 제스처 포함)가 페이지를 떠나지 않고 시트만 닫게 한다.
  const openId = parseDetailId(searchParams);
  const openGame: BoardGame | undefined = openId === null ? undefined : list.find((g) => g.id === openId);
  const open = openGame === undefined ? null : openGame.id;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const triggerIdRef = useRef<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // 닫힌 뒤(닫기 버튼·Esc·배경 클릭·URL 변경 모두) 포커스를 연 카드로 돌린다.
  // 카드가 목록에서 사라졌으면 결과 요약 줄로 보낸다.
  useEffect(() => {
    if (open !== null) return;
    const trigger = triggerRef.current;
    const triggerId = triggerIdRef.current;
    triggerRef.current = null;
    triggerIdRef.current = null;
    // 숨김으로 닫힌 경우는 카드(이제 목록에 없음)보다 알림의 되돌리기가 먼저다. 링크로 바로 연 상세도 마찬가지
    if (focusUndoRef.current) {
      focusUndoRef.current = false;
      const undo = toastActionRef.current;
      if (undo !== null && undo.isConnected) {
        undo.focus();
        return;
      }
    }
    if (trigger === null) return;
    if (trigger.isConnected) return trigger.focus();
    // 수정으로 첫 플레이 연도가 바뀌면 카드가 다른 연도 목록으로 옮겨 가며 새로 그려진다. 같은 게임에서 연 버튼
    // (제목 버튼 data-role="open" 또는 "수정" 칩 data-role="edit")을 다시 찾고, 없으면(숨긴 게임엔 칩이 없다) 제목 버튼으로 간다
    const find = (role: string) =>
      triggerId === null
        ? null
        : document.querySelector<HTMLButtonElement>(
            `button[data-game-id="${CSS.escape(triggerId)}"][data-role="${role}"]`,
          );
    const moved = find(trigger.dataset.role === 'edit' ? 'edit' : 'open') ?? find('open');
    if (moved !== null) moved.focus();
    else topRef.current?.focus({ preventScroll: true });
  }, [open]);

  // 게임 추가 흐름이 닫히면(취소·버리기·추가 완료) "게임 추가" 버튼으로 포커스를 돌린다. 1·2단계가 서로 다른
  // dialog라 네이티브 복귀는 사라진 요소를 가리키고, 열린 modal 안에서 부르면 바깥 버튼이 inert라 무시된다.
  // 그래서 dialog가 DOM에서 빠진 뒤(effect)에 한다.
  useEffect(() => {
    if (adding) wasAdding.current = true;
    else if (wasAdding.current) {
      wasAdding.current = false;
      addBtnRef.current?.focus();
    }
  }, [adding]);

  const writeUrl = useCallback(
    (next: GamesQueryState, mode: 'push' | 'replace') => {
      const qs = serializeQueryState(next);
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (mode === 'push') window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
    },
    [pathname],
  );

  const change = (patch: Partial<GamesQueryState>) => writeUrl(applyFilterChange(state, patch), 'push');

  const detailUrl = (id: string | null) => {
    const qs = detailQuery(state, id);
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const onOpen = (game: BoardGame, trigger: HTMLButtonElement, edit = false) => {
    triggerRef.current = trigger;
    triggerIdRef.current = game.id;
    setEditFor(edit ? game.id : null);
    window.history.pushState({ [DETAIL_ENTRY]: true }, '', detailUrl(game.id));
  };

  // ---- 관리자 동작 ----
  const applyRecord = (rec: GameRecord) =>
    setRecords((prev) => (prev.some((r) => r.id === rec.id) ? prev.map((r) => (r.id === rec.id ? rec : r)) : [...prev, rec]));

  const onSaved = (rec: GameRecord, created: boolean) => {
    applyRecord(rec);
    if (created) setAdding(false);
    showToast(created ? addedMessage(rec.name) : savedMessage(rec.name));
    router.refresh();
  };

  // 숨김/다시 보이기. 실패하면 사용자에게 보일 문구를 돌려준다.
  const toggleHidden = async (game: AdminGame | BoardGame, hidden: boolean): Promise<string | null> => {
    const res = await adminApi.setHidden(game.id, hidden);
    if (res.status !== 200 || !isWrite(res.body)) {
      return res.status === 401
        ? '로그인이 만료됐어요. 새로 고친 뒤 다시 로그인해 주세요.'
        : errorMessage(res.body, '잠시 후 다시 시도해 주세요.');
    }
    applyRecord(res.body.game);
    router.refresh();
    if (hidden) {
      showToast(hiddenMessage(game.name), {
        label: '되돌리기',
        run: () => {
          // 누른 버튼은 곧 사라진다. 포커스를 결과 요약 줄(다시 나타날 카드 바로 위)로 옮겨 둔다
          topRef.current?.focus({ preventScroll: true });
          void toggleHidden(game, false).then((m) => m !== null && showToast(m));
        },
      });
    } else {
      showToast(unhiddenMessage(game.name));
    }
    return null;
  };

  const adminDetail: AdminDetailContext | null = isAdmin
    ? {
        all: records,
        startInEdit: openGame !== undefined && editFor === openGame.id,
        onRecord: applyRecord,
        onSaved,
        onToggleHidden: async (game, hidden) => {
          const message = await toggleHidden(game, hidden);
          if (message === null && hidden) {
            focusUndoRef.current = true;
            onClose();
          }
          return message;
        },
        toast: <Toast toast={toast} onDismiss={dismissToast} onHold={setToastHeld} />,
      }
    : null;

  const dialogOpen = openGame !== undefined || adding;

  const onClose = () => {
    // 이 페이지에서 쌓은 기록(앞으로가기로 돌아온 경우 포함)이면 back, 링크로 바로 들어왔으면 replace.
    if (window.history.state?.[DETAIL_ENTRY] === true) window.history.back();
    else window.history.replaceState(null, '', detailUrl(null));
  };

  const active = hasActiveFilter(state);

  const renderCard = (game: BoardGame) => (
    <GameCard
      key={game.id}
      game={game}
      titleAs="h3"
      sort={state.sort}
      onOpen={onOpen}
      admin={
        isAdmin
          ? {
              onEdit: (g, trigger) => onOpen(g, trigger, true),
              onUnhide: (g) => void toggleHidden(g, false).then((m) => m !== null && showToast(m)),
            }
          : undefined
      }
    />
  );

  const renderItems = (items: BoardGame[], monthly: boolean) =>
    state.view === 'diary' ? (
      monthly ? (
        <DiaryList months={diaryMonths(items, state.sort)} sort={state.sort} onOpen={onOpen} />
      ) : (
        <DiaryList flat={items} sort={state.sort} onOpen={onOpen} />
      )
    ) : (
      <ul className={styles.wall}>{items.map(renderCard)}</ul>
    );

  // 연도 목차. 넓은 화면은 기록판 안 세로 목록, 좁은 화면은 내용 위에 붙는 가로 띠라 둘 다 그리고 CSS로 하나만 보인다
  const rail = (where: 'board' | 'strip') =>
    chapters !== null &&
    chapters.length > 1 && (
      <nav className={where === 'board' ? styles.rail : styles.railStrip} aria-label={chapterAxisLabel(state.sort)}>
        {where === 'board' && (
          <span className={styles.groupLabel} aria-hidden="true">
            {chapterAxisLabel(state.sort)}
          </span>
        )}
        {chapters.map((c) => (
          <button
            key={c.key}
            type="button"
            className={styles.railItem}
            aria-current={spy.current === c.key ? 'location' : undefined}
            onClick={() => spy.jump(c.key)}
          >
            <span className={styles.railNo} aria-hidden="true">{c.no}</span>
            <span className={c.kind === 'year' ? styles.railYear : styles.railNone}>{c.kind === 'year' ? c.heading : '날짜 없음'}</span>
            <span className={styles.railCount}>
              {c.count}
              <span className={styles.srOnly}>개</span>
            </span>
          </button>
        ))}
      </nav>
    );

  return (
    <>
      {isAdmin && (
        <div className={styles.adminSlot}>
          <AdminBar
            showHidden={showHidden}
            hiddenCount={hiddenCount}
            onShowHidden={setShowHidden}
            onAdd={() => setAdding(true)}
            addRef={addBtnRef}
          />
        </div>
      )}

      {/* /about 도감과 같은 골격: 왼쪽 기록판은 고정, 오른쪽 연도 챕터가 스크롤된다 */}
      <div className={styles.layout}>
        <div className={styles.board}>
          <div className={styles.boardIn}>
            <section className={styles.header} aria-labelledby="games-title">
              <SectionLabel style={{ marginBottom: 0 }}>EXPEDITION LOG</SectionLabel>
              <h1 id="games-title" className={styles.title}>플레이한 게임</h1>
              <p className={styles.lead}>야시로가 방송에서 탐험한 게임 행성들의 기록이에요.</p>
              <dl className={styles.stats}>
                <div className={styles.stat}>
                  <dt>기록된 게임</dt>
                  <dd><CountUp kind="total" to={stats.total} /><span className={styles.unit}>개</span></dd>
                </div>
                <div className={styles.stat}>
                  <dt>정복</dt>
                  <dd><span className={styles.statClear}><CountUp kind="clear" to={stats.clear} /></span><span className={styles.unit}>개</span></dd>
                </div>
              </dl>
            </section>

            <section className={styles.controls} aria-label="검색과 필터">
              <div className={styles.group}>
                <label htmlFor="game-q" className={styles.groupLabel}>게임 검색</label>
                <div className={styles.search}>
                  <Search size={18} strokeWidth={1.8} aria-hidden="true" />
                  <input
                    id="game-q"
                    type="search"
                    className={styles.searchInput}
                    value={typed}
                    maxLength={Q_MAX}
                    placeholder="한글·원제·초성"
                    onChange={(e) => {
                      setTyped(e.target.value);
                      writeUrl(applyFilterChange(state, { q: normalizeQ(e.target.value) }), 'replace');
                    }}
                  />
                </div>
              </div>

              <div className={styles.group}>
                <span id="status-label" className={styles.groupLabel}>정복 여부</span>
                <div role="group" aria-labelledby="status-label" className={styles.chips}>
                  {STATUS_FILTERS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={styles.chip}
                      aria-pressed={state.status === key}
                      onClick={() => change({ status: key })}
                    >
                      {STATUS_FILTER_LABEL[key]}
                      <span className={styles.chipCount}>
                        {counts[key]}
                        <span className={styles.srOnly}>개</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

            </section>

            {rail('board')}
          </div>
        </div>

        {rail('strip')}

        <div className={styles.content}>
          {/* 보기(표지·일지)는 필터와 따로, 본문 맨 위 탭으로. 오른쪽은 결과 요약(검색·필터를 바꾸면 읽어 준다) */}
          <div className={styles.contentBar}>
            <span id="view-label" className={styles.srOnly}>보기</span>
            <div role="group" aria-labelledby="view-label" className={styles.views}>
              {VIEW_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={styles.viewBtn}
                  aria-pressed={state.view === key}
                  onClick={() => change({ view: key })}
                >
                  {VIEW_LABEL[key]}
                </button>
              ))}
            </div>
            <div ref={topRef} tabIndex={-1} className={styles.statusRow}>
              {active && (
                <button type="button" className={styles.linkBtn} onClick={() => change({ q: '', status: 'all', year: 'all' })}>
                  검색·필터 초기화
                </button>
              )}
              <p role="status" className={styles.status}>{resultSummary(results.length, resultClear, state)}</p>
              {/* 정렬은 이 목록의 순서라 필터가 아니라 보기 옆에 */}
              <label htmlFor="game-sort" className={styles.srOnly}>정렬</label>
              <span className={styles.selectWrap}>
                <select
                  id="game-sort"
                  className={styles.select}
                  value={state.sort}
                  onChange={(e) => change({ sort: parseSortKey(e.target.value) })}
                >
                  {SORT_KEYS.map((key) => (
                    <option key={key} value={key}>{SORT_LABEL[key]}</option>
                  ))}
                </select>
                <svg className={styles.selectArrow} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
                  <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </div>

          {results.length > 0 ? (
            chapters === null ? (
              <div className={styles.plain}>{renderItems(results, false)}</div>
            ) : (
              chapters.map((c) => (
                <section key={c.key} className={styles.chapter} data-chapter={c.key} aria-labelledby={`chapter-${c.key}`}>
                  <h2 id={`chapter-${c.key}`} tabIndex={-1} className={styles.chapterTitle}>
                    <span className={styles.chapterNo} aria-hidden="true">{c.no}</span>
                    <span className={c.kind === 'year' ? styles.chapterYear : styles.chapterNone}>
                      {c.heading}
                      {c.kind === 'year' && <span className={styles.srOnly}>년</span>}
                    </span>
                    <span className={styles.chapterCount}>{c.countText}</span>
                  </h2>
                  {renderItems(c.items, true)}
                </section>
              ))
            )
          ) : (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>현재 조건에 맞는 게임이 없어요</p>
              <p className={styles.emptyDesc}>{describeConditions(state)}</p>
              <div className={styles.emptyActions}>
                {state.q !== '' && (
                  <button type="button" className={styles.solidBtn} onClick={() => change({ q: '' })}>
                    검색어 지우기
                  </button>
                )}
                {hasFilterSelection(state) && (
                  <button type="button" className={state.q !== '' ? styles.ghostBtn : styles.solidBtn} onClick={() => change({ status: 'all', year: 'all' })}>
                    필터 해제
                  </button>
                )}
              </div>
            </div>
          )}

          <div className={styles.foot}>
            <p className={styles.footnote}>
              정복 도장은 확인된 게임에만 찍어요. 게임 이름과 포스터는 치지직 카테고리 정보를 따릅니다. 비공식 팬 사이트의 기록이라 빠진 게임이 있을 수 있어요.
            </p>
            {/* 방문자용 로그인 버튼이 없으므로 관리자(야시로 포함)는 여기서 들어온다. 허용 목록에 없으면 로그인돼도 관리 UI가 안 보인다 */}
            {!isAdmin && (
              <p className={styles.adminLogin}>
                <a href="/auth/login?next=/games">관리자 로그인</a>
              </p>
            )}
          </div>
        </div>
      </div>

      {openGame && <GameDetailDialog key={openGame.id} game={openGame} admin={adminDetail} onClose={onClose} />}
      {isAdmin && adding && (
        <AddGameFlow
          all={records}
          toast={<Toast toast={toast} onDismiss={dismissToast} onHold={setToastHeld} />}
          onRecord={applyRecord}
          onSaved={onSaved}
          onClose={() => setAdding(false)}
        />
      )}
      {isAdmin && (
        <Toast toast={dialogOpen ? null : toast} onDismiss={dismissToast} onHold={setToastHeld} actionRef={toastActionRef} />
      )}
    </>
  );
}

// 새 기록이 생겼을 때만 "지난번에 본 값 → 지금 값"으로 한 번 올라가는 숫자. 지난 값은 layout head 스크립트가
// html의 --seen-total/--seen-clear로 미리 깔아 두므로 서버가 그린 첫 화면부터 맞다(깜빡임 없음). 처음 온 사람·변화 없음은 정지.
// CSS(@property 정수 애니메이션 + counter)만으로 움직이고, 지원하지 않는 브라우저는 최종값만 보인다.
// 보이는 숫자는 장식(aria-hidden)이고 실제 값은 srOnly 텍스트로 읽힌다.
function CountUp({ kind, to }: { kind: 'total' | 'clear'; to: number }) {
  return (
    <>
      <span
        className={styles.count}
        style={{ '--to': to, '--from': `min(var(--seen-${kind}, ${to}), ${to})`, '--digits': String(to).length } as CSSProperties}
        aria-hidden="true"
      />
      <span className={styles.srOnly}>{to}</span>
    </>
  );
}
