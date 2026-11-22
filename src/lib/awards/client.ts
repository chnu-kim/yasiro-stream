// /api/awards 응답 해석과 화면 문구(클라이언트). 순수 함수만. fetch는 src/app/awards/awardsApi.ts가 맡는다.
import { DIVISIONS } from "./entries.ts";
import { SUBMIT_LIMIT_PER_DAY } from "./limit.ts";
import { MIN_DECIDED_MATCHES, type TallyRow } from "./rankings.ts";
import { DRAW_TTL_SECONDS } from "./token.ts";
import { isValidBracket } from "./verify.ts";
import type { TournamentState } from "./types.ts";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// ---------- 대진 뽑기 ----------

export type DrawFailure = "network" | "login" | "forbidden" | "unconfigured" | "size" | "stale" | "unknown";
export type DrawOutcome = { ok: true; run: TournamentState; token: string } | { ok: false; reason: DrawFailure };

function isRunShape(v: unknown): v is TournamentState {
  return (
    isRecord(v) &&
    v.v === 1 &&
    typeof v.division === "string" &&
    (DIVISIONS as readonly string[]).includes(v.division) &&
    typeof v.thirdPlace === "boolean" &&
    Array.isArray(v.picks) &&
    v.picks.length === 0 &&
    isValidBracket(v.bracket)
  );
}

/** status 0 = 네트워크. 200이어도 run·token 모양이 틀리면 unknown.
 *  대진의 게임 중 knownIds(이 화면이 가진 entries)에 없는 것이 있으면 stale(대결 화면이 이름을 못 찾아 깨지는 것을 막는다) */
export function classifyDraw(status: number, body: unknown, knownIds: ReadonlySet<string>): DrawOutcome {
  if (status === 0) return { ok: false, reason: "network" };
  if (status === 200) {
    if (!isRecord(body) || typeof body.token !== "string" || !isRunShape(body.run)) return { ok: false, reason: "unknown" };
    const run = body.run;
    if (run.bracket.slots.some((id) => id !== null && !knownIds.has(id))) return { ok: false, reason: "stale" };
    return { ok: true, run, token: body.token };
  }
  if (status === 401) return { ok: false, reason: "login" };
  if (status === 403) return { ok: false, reason: "forbidden" };
  if (status === 422) return { ok: false, reason: "size" };
  if (status === 503) return { ok: false, reason: "unconfigured" };
  return { ok: false, reason: "unknown" };
}

export const DRAW_LOADING_TEXT = "대진을 뽑는 중…";

export function drawFailureMessage(reason: DrawFailure): string {
  switch (reason) {
    case "network":
      return "연결이 끊겨 대진을 뽑지 못했어요. 다시 눌러 주세요.";
    case "login":
      return "로그인이 만료됐어요. 다시 로그인해 주세요.";
    case "forbidden":
      return "권한이 없어요.";
    case "unconfigured":
      return "어워즈 설정이 끝나지 않아 시작할 수 없어요.";
    case "size":
      return "후보 수가 바뀌어 이 대진을 뽑을 수 없어요. 새로고침해 주세요.";
    case "stale":
      return "게임 목록이 바뀌었어요. 새로고침해 주세요.";
    case "unknown":
      return "대진을 뽑지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
}

// ---------- 결과 제출 ----------

export type SubmitFailure = "network" | "limit" | "limitUnsure" | "duplicate" | "expired" | "login" | "forbidden" | "unconfigured" | "unknown";
export type SubmitStatus = { kind: "sending"; retried: boolean } | { kind: "done" } | { kind: "failed"; reason: SubmitFailure };

const failed = (reason: SubmitFailure): SubmitStatus => ({ kind: "failed", reason });

/**
 * retried이고 409면 done: 앞서 끊긴 요청이 실제로는 들어간 경우다(대진은 한 번만 집계된다).
 * retried이고 429면 limitUnsure: 서버는 한도를 중복 검사보다 먼저 보므로, 끊긴 요청이 그날 마지막 한도 자리로
 * 들어갔다면 재시도는 409가 아니라 429가 된다. 반영 여부를 알 수 없다.
 */
export function classifySubmit(status: number, retried: boolean): SubmitStatus {
  switch (status) {
    case 0:
      return failed("network");
    case 200:
      return { kind: "done" };
    case 401:
      return failed("login");
    case 403:
      return failed("forbidden");
    case 409:
      return retried ? { kind: "done" } : failed("duplicate");
    case 410:
      return failed("expired");
    case 429:
      return retried ? failed("limitUnsure") : failed("limit");
    case 503:
      return failed("unconfigured");
    default:
      return failed("unknown");
  }
}

export function submitStatusText(s: SubmitStatus): string {
  if (s.kind === "sending") return "집계에 반영하는 중…";
  if (s.kind === "done") return "집계에 반영됐어요.";
  switch (s.reason) {
    case "limit":
      return `오늘 이 부문은 ${SUBMIT_LIMIT_PER_DAY}번까지 집계돼요. 이번 결과는 반영되지 않았어요.`;
    case "limitUnsure":
      return `오늘 이 부문은 ${SUBMIT_LIMIT_PER_DAY}번까지 집계돼요. 끊긴 요청이 이미 반영됐을 수 있어요.`;
    case "duplicate":
      return "이미 집계에 반영된 대진이에요.";
    case "expired":
      return `대진을 뽑은 지 ${DRAW_TTL_SECONDS / 3600}시간이 지나 집계에 넣지 못했어요.`;
    case "network":
      return "연결이 끊겨 집계에 반영하지 못했어요.";
    case "login":
      return "로그인이 만료돼 집계에 반영하지 못했어요.";
    case "forbidden":
    case "unconfigured":
    case "unknown":
      return "집계에 반영하지 못했어요.";
  }
}

export function canRetrySubmit(s: SubmitStatus): boolean {
  return s.kind === "failed" && s.reason === "network";
}

// ---------- 순위 ----------

/** 순위를 읽지 못했을 때(/awards/rankings 서버 렌더에서 rankings null, 0013 미적용 등) */
export const RANKINGS_FAILURE_TEXT = "순위를 불러오지 못했어요.";

/** "75%"(반올림). 0판이면 "—" */
export function winRateText(wins: number, losses: number): string {
  const total = wins + losses;
  return total === 0 ? "—" : `${Math.round((wins / total) * 100)}%`;
}

/** "우승 3 · 12승 4패 · 승률 75%" */
export function rankingStatsText(row: TallyRow): string {
  return `우승 ${row.championships} · ${row.wins}승 ${row.losses}패 · 승률 ${winRateText(row.wins, row.losses)}`;
}

export function runsSummaryText(runs: number): string {
  return `집계된 대진 ${runs}판`;
}

/** 목록이 비었을 때 문구. 대진이 하나도 없으면 둘 다 그 문구, 아니면 승률 목록만 대결 수 안내 */
export function emptyRankingText(runs: number, list: "championships" | "winRate"): string {
  if (runs === 0) return "아직 집계된 대진이 없어요.";
  return list === "winRate" ? `대결 ${MIN_DECIDED_MATCHES}판을 채운 게임이 아직 없어요.` : "아직 집계된 대진이 없어요.";
}

export function winRateNote(minMatches: number): string {
  return `대결 ${minMatches}판 이상인 게임만 보여요.`;
}
