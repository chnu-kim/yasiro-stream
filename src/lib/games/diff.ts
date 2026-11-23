// 게임 차이·변경 요약·시각 문구. 서버(repo.ts)와 클라이언트가 같이 쓰는 순수 함수.
import { STATUS_FILTER_LABEL } from "./labels.ts";
import { formatDate } from "./query.ts";
import { sortVods } from "./rows.ts";
import { youtubeVideoId } from "./schema.ts";
import type { ChangeAction, Game, GameField, GameRecord, Vod } from "./types.ts";

export const FIELD_LABEL: Readonly<Record<GameField, string>> = {
  name: "이름",
  originalTitle: "원제",
  category: "치지직 카테고리",
  firstPlayed: "첫 플레이",
  lastPlayed: "마지막 플레이",
  status: "정복 여부",
  vods: "다시보기",
};

export const FIELD_ORDER: readonly GameField[] = ["name", "originalTitle", "category", "firstPlayed", "lastPlayed", "status", "vods"];

const SUMMARY_MAX = 300;

function vodsKey(g: Game): string {
  return JSON.stringify(sortVods(g.vods).map((v) => [v.title, v.url, v.date, v.highlightStart ?? null]));
}

const DIFFERS: Readonly<Record<GameField, (a: Game, b: Game) => boolean>> = {
  name: (a, b) => a.name !== b.name,
  originalTitle: (a, b) => a.originalTitle !== b.originalTitle,
  category: (a, b) => a.categoryId !== b.categoryId || a.posterUrl !== b.posterUrl,
  firstPlayed: (a, b) => a.firstPlayed !== b.firstPlayed,
  lastPlayed: (a, b) => (a.lastPlayed ?? null) !== (b.lastPlayed ?? null),
  status: (a, b) => a.status !== b.status,
  vods: (a, b) => vodsKey(a) !== vodsKey(b),
};

export function diffGames(before: Game, after: Game): GameField[] {
  return FIELD_ORDER.filter((f) => DIFFERS[f](before, after));
}

function vodsById(g: Game): Map<string, Vod> {
  return new Map(g.vods.map((v) => [youtubeVideoId(v.url) ?? v.url, v]));
}

/** 추가·삭제 수 + 공통 영상(같은 ID)의 정보(제목·날짜)·하이라이트 변화. 새로 추가한 영상의 하이라이트는 "N편 추가"에 포함된다 */
function vodsPiece(before: Game, after: Game): string {
  const a = vodsById(before);
  const b = vodsById(after);
  const added = [...b.keys()].filter((id) => !a.has(id)).length;
  const removed = [...a.keys()].filter((id) => !b.has(id)).length;
  let info = false;
  let hl = false;
  for (const [id, x] of a) {
    const y = b.get(id);
    if (y === undefined) continue;
    if (x.title !== y.title || x.date !== y.date) info = true;
    if ((x.highlightStart ?? null) !== (y.highlightStart ?? null)) hl = true;
  }
  const pieces: string[] = [];
  if (added > 0 && removed > 0) pieces.push(`다시보기 ${added}편 추가·${removed}편 삭제`);
  else if (added > 0) pieces.push(`다시보기 ${added}편 추가`);
  else if (removed > 0) pieces.push(`다시보기 ${removed}편 삭제`);
  else if (info) pieces.push("다시보기 정보 수정");
  if (hl) pieces.push("하이라이트 바뀜");
  // 같은 날짜끼리 순서만 바뀐 경우 등
  return pieces.length === 0 ? "다시보기 정보 수정" : pieces.join("·");
}

function categoryPiece(before: Game, after: Game): string {
  if (before.categoryId === after.categoryId) return "포스터 바뀜";
  return `치지직 카테고리 ${before.categoryId ?? "없음"} → ${after.categoryId ?? "없음"}`;
}

const PIECE: Readonly<Record<GameField, (a: Game, b: Game) => string>> = {
  name: (a, b) => `이름 ${a.name} → ${b.name}`,
  originalTitle: (a, b) => `원제 ${a.originalTitle ?? "없음"} → ${b.originalTitle ?? "없음"}`,
  category: categoryPiece,
  firstPlayed: (a, b) => `첫 플레이 ${formatDate(a.firstPlayed)} → ${formatDate(b.firstPlayed)}`,
  // 관리자 전용 값이라 값을 적지 않는다(변경 기록은 관리자만 보지만 요약 문구는 스펙대로)
  lastPlayed: () => "마지막 플레이 바뀜",
  status: (a, b) => `정복 여부 ${STATUS_FILTER_LABEL[a.status]} → ${STATUS_FILTER_LABEL[b.status]}`,
  vods: vodsPiece,
};

function clip(s: string): string {
  const chars = Array.from(s);
  return chars.length > SUMMARY_MAX ? chars.slice(0, SUMMARY_MAX - 1).join("") + "…" : s;
}

export function changeSummary(action: ChangeAction, before: Game | null, after: Game): string {
  switch (action) {
    case "import":
      return "games.json에서 가져옴";
    case "create":
      return "게임 추가";
    case "hide":
      return "목록에서 숨김";
    case "unhide":
      return "다시 보이기";
    case "update": {
      const base = before ?? after;
      const pieces = diffGames(base, after).map((f) => PIECE[f](base, after));
      return pieces.length === 0 ? "변경 없음" : clip(pieces.join(", "));
    }
  }
}

const KST = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "2026.10.25 14:02" (Asia/Seoul 고정 — SSR/CSR 동일) */
export function formatChangeTime(unixSeconds: number): string {
  const p: Record<string, string> = {};
  for (const part of KST.formatToParts(new Date(unixSeconds * 1000))) p[part.type] = part.value;
  return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
}

export function conflictMessage(latest: Pick<GameRecord, "updatedByName" | "updatedAt">): string {
  const josa = latest.updatedByName === "시스템" ? "이" : "가";
  const time = formatChangeTime(latest.updatedAt).slice(-5);
  return `${latest.updatedByName}${josa} 방금(${time}) 이 게임을 먼저 고쳤어요. 저장하면 그 변경을 덮어써요.`;
}
