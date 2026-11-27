// /api/awards Route Handler와 /awards 페이지의 로직. Route Handler는 이 함수들에 deps만 넘긴다.
// 익명 규칙: award 테이블·응답·로그에 채널 ID·채널 이름·IP·IP 해시·토큰·drawId·picks를 넣지 않는다.
// 로그는 "awards-api unavailable <error.name>", "awards-api secret missing", "awards-api token too large"뿐이다.
import { getSessionActor, isAdminChannel, parseAdminIds } from "../games/admin.ts";
import { listGames } from "../games/repo.ts";
import { isChzzkPosterUrl } from "../games/schema.ts";
import { checkSameOrigin } from "../http.ts";
import { readJsonBody } from "../json-body.ts";
import { DIVISIONS, toAwardEntries } from "./entries.ts";
import { newRun } from "./flow.ts";
import { deriveAwardKeys } from "./keys.ts";
import { ipBucket, kstDay, limitKeyHash, secondsUntilNextKstDay, SUBMIT_LIMIT_PER_DAY } from "./limit.ts";
import { SIZE_LADDER, sizeEnabled } from "./options.ts";
import { rankTally, type Rankings } from "./rankings.ts";
import { loadDivisionCandidates, loadPlayedDates, loadRankingRows, readLimitCount, recordRun } from "./repo.ts";
import { DRAW_TTL_SECONDS, signDraw, verifyDraw, type DrawClaims } from "./token.ts";
import { MAX_PICKS, verifyRun } from "./verify.ts";
import type { GameRecord, GamesDb, SessionState } from "../games/types.ts";
import type { AwardEntry, Division } from "./types.ts";

/** 공개 전환은 이 값 하나. 지금은 관리자만(페이지·draw·submit·rankings 모두 awardsGate를 거친다) */
export const AWARDS_PUBLIC = false;

export interface AwardsDeps {
  db: GamesDb;
  env: { ADMIN_CHANNEL_IDS?: string; AWARDS_SECRET?: string };
  /** unix seconds */
  now: () => number;
  /** drawId(소문자 uuid v4) */
  uuid: () => string;
  /** [0,1). 운영은 cryptoRng() */
  rng: () => number;
  /** 운영: console.error */
  log?: (message: string) => void;
  /** 포스터 중계(handlePoster)만 쓴다. 운영: (i, init) => fetch(i, init) (그냥 넘기면 Workers에서 Illegal invocation) */
  fetch?: (input: string, init?: PosterFetchInit) => Promise<Response>;
}

/** Workers fetch 옵션 + Cloudflare 이미지 변환(cf.image). Node(로컬)는 cf를 무시하고 원본을 준다 */
export type PosterFetchInit = RequestInit & { cf?: { image: { format: "webp"; quality: number } } };

export const DRAW_BODY_MAX_BYTES = 1024;
export const SUBMIT_BODY_MAX_BYTES = 512 * 1024;

export type AwardsErrorCode =
  | "bad_request"
  | "bad_json"
  | "bad_token"
  | "payload_too_large"
  | "login_required"
  | "session_expired"
  | "forbidden"
  | "cross_origin"
  | "size_unavailable"
  | "invalid_run"
  | "already_submitted"
  | "draw_expired"
  | "rate_limited"
  | "unconfigured"
  | "upstream_failed"
  | "unavailable";

// ---------- 응답 ----------

function respond(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function fail(status: number, code: AwardsErrorCode, message: string, headers?: Record<string, string>): Response {
  return respond(status, { error: { code, message } }, headers);
}

function unavailable(): Response {
  return fail(500, "unavailable", "잠시 후 다시 시도해 주세요.");
}

/** 예상 못 한 예외를 500으로. 로그에는 error.name만 */
function unexpected(deps: AwardsDeps, error: unknown): Response {
  deps.log?.(`awards-api unavailable ${error instanceof Error ? error.name : "unknown"}`);
  return unavailable();
}

async function guarded(deps: AwardsDeps, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return unexpected(deps, error);
  }
}

const badRequest = () => fail(400, "bad_request", "요청 모양이 올바르지 않아요.");
const rateLimited = (now: number) =>
  fail(429, "rate_limited", `오늘 이 부문은 ${SUBMIT_LIMIT_PER_DAY}번까지 집계돼요.`, { "Retry-After": String(secondsUntilNextKstDay(now)) });

// ---------- 권한 ----------

export type AwardsAccess = "ok" | "login_required" | "session_expired" | "forbidden";

/** isPublic이면 누구나 ok. 아니면 관리자만 */
export function awardsAccess(state: SessionState, isPublic: boolean = AWARDS_PUBLIC): AwardsAccess {
  if (isPublic) return "ok";
  switch (state.kind) {
    case "anonymous":
      return "login_required";
    case "expired":
      return "session_expired";
    case "user":
      return "forbidden";
    case "admin":
      return "ok";
  }
}

/** Nav에 "어워즈" 링크를 보일지. 페이지 게이트(awardsAccess)와 같은 규칙: 공개면 누구나, 아니면 허용 목록의 로그인 채널만.
 *  channelId = 유효한 세션의 채널(없으면 null), rawAdminIds = Worker secret ADMIN_CHANNEL_IDS 원문 */
export function awardsNavVisible(channelId: string | null, rawAdminIds: string | undefined, isPublic: boolean = AWARDS_PUBLIC): boolean {
  if (isPublic) return true;
  return channelId !== null && isAdminChannel(channelId, parseAdminIds(rawAdminIds));
}

export function awardsGate(state: SessionState, isPublic: boolean = AWARDS_PUBLIC): "ok" | Response {
  switch (awardsAccess(state, isPublic)) {
    case "ok":
      return "ok";
    case "login_required":
      return fail(401, "login_required", "치지직으로 로그인해 주세요.");
    case "session_expired":
      return fail(401, "session_expired", "로그인이 만료됐어요. 다시 로그인해 주세요.");
    case "forbidden":
      return fail(403, "forbidden", "권한이 없어요.");
  }
}

function sessionOf(deps: AwardsDeps, cookieHeader: string | null): Promise<SessionState> {
  return getSessionActor(deps.db, cookieHeader, deps.now(), parseAdminIds(deps.env.ADMIN_CHANNEL_IDS));
}

/** 권한 확인. 통과하면 null, 아니면 돌려줄 Response */
async function gate(req: Request, deps: AwardsDeps): Promise<Response | null> {
  const g = awardsGate(await sessionOf(deps, req.headers.get("cookie")));
  return g === "ok" ? null : g;
}

async function keysOr503(deps: AwardsDeps) {
  const keys = await deriveAwardKeys(deps.env.AWARDS_SECRET);
  if (keys === null) deps.log?.("awards-api secret missing");
  return keys;
}

const unconfigured = () => fail(503, "unconfigured", "어워즈 설정이 끝나지 않았어요.");

// ---------- 모양 ----------

type Obj = Record<string, unknown>;

function hasExactKeys(v: unknown, keys: readonly string[]): v is Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const own = Object.keys(v).sort();
  return own.length === keys.length && own.every((k, i) => k === keys[i]);
}

function parseDivision(raw: unknown): Division | null {
  return DIVISIONS.includes(raw as Division) ? (raw as Division) : null;
}

interface DrawRequest {
  division: Division;
  size: number;
  thirdPlace: boolean;
}

function parseDrawRequest(body: unknown): DrawRequest | null {
  if (!hasExactKeys(body, ["division", "size", "thirdPlace"])) return null;
  const division = parseDivision(body.division);
  const { size, thirdPlace } = body;
  // 엔진 sizeEnabled는 2·8도 허용하므로 사다리(SIZE_LADDER)는 여기서 막는다
  if (division === null || typeof size !== "number" || !SIZE_LADDER.includes(size) || typeof thirdPlace !== "boolean") return null;
  return { division, size, thirdPlace };
}

function parseSubmitRequest(body: unknown): { token: string; picks: string[] } | null {
  if (!hasExactKeys(body, ["picks", "token"])) return null;
  const { token, picks } = body;
  if (typeof token !== "string" || !Array.isArray(picks) || picks.length > MAX_PICKS) return null;
  if (!picks.every((p) => typeof p === "string")) return null;
  return { token, picks };
}

// ---------- 핸들러 ----------

/** POST /api/awards/draw { division, size, thirdPlace } → { token, run, expiresAt }. D1에 쓰지 않는다 */
export function handleDraw(req: Request, deps: AwardsDeps): Promise<Response> {
  return guarded(deps, async () => {
    if (!checkSameOrigin(req)) return fail(403, "cross_origin", "다른 사이트에서 보낸 요청은 받을 수 없어요.");
    const denied = await gate(req, deps);
    if (denied !== null) return denied;
    const keys = await keysOr503(deps);
    if (keys === null) return unconfigured();
    const body = await readJsonBody(req, DRAW_BODY_MAX_BYTES);
    if (!body.ok) return body.response;
    const input = parseDrawRequest(body.value);
    if (input === null) return badRequest();
    const ids = await loadDivisionCandidates(deps.db, input.division);
    if (!sizeEnabled(input.size, ids.length)) return fail(422, "size_unavailable", "후보 수가 바뀌어 이 대진을 뽑을 수 없어요.");
    const run = newRun(ids, input.division, input.size, input.thirdPlace, deps.rng);
    const now = deps.now();
    const claims: DrawClaims = {
      drawId: deps.uuid(),
      division: run.division,
      bracket: run.bracket,
      thirdPlace: run.thirdPlace,
      issuedAt: now,
      expiresAt: now + DRAW_TTL_SECONDS,
    };
    let token: string;
    try {
      token = await signDraw(keys.draw, claims);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      deps.log?.("awards-api token too large");
      return unavailable();
    }
    return respond(200, { token, run, expiresAt: claims.expiresAt });
  });
}

/** POST /api/awards/submit?division= { token, picks }.
 *  순서: 출처 → 권한 → secret → 쿼리 부문 → 제출 한도(본문 전) → 본문 → 모양 → 토큰 → 부문 일치 → verifyRun → batch */
export function handleSubmit(req: Request, deps: AwardsDeps): Promise<Response> {
  return guarded(deps, async () => {
    if (!checkSameOrigin(req)) return fail(403, "cross_origin", "다른 사이트에서 보낸 요청은 받을 수 없어요.");
    const denied = await gate(req, deps);
    if (denied !== null) return denied;
    const keys = await keysOr503(deps);
    if (keys === null) return unconfigured();
    const division = parseDivision(new URL(req.url).searchParams.get("division"));
    if (division === null) return badRequest();

    const now = deps.now();
    const day = kstDay(now);
    const keyHash = await limitKeyHash(keys.limit, day, ipBucket(req.headers.get("cf-connecting-ip")));
    if ((await readLimitCount(deps.db, day, keyHash, division)) >= SUBMIT_LIMIT_PER_DAY) return rateLimited(now);

    const body = await readJsonBody(req, SUBMIT_BODY_MAX_BYTES);
    if (!body.ok) return body.response;
    const input = parseSubmitRequest(body.value);
    if (input === null) return badRequest();

    const checked = await verifyDraw(keys.draw, input.token, now);
    if (!checked.ok) {
      return checked.reason === "expired"
        ? fail(410, "draw_expired", `대진을 뽑은 지 ${DRAW_TTL_SECONDS / 3600}시간이 지나 집계에 넣을 수 없어요.`)
        : fail(400, "bad_token", "대진 정보가 올바르지 않아요.");
    }
    const { claims } = checked;
    if (claims.division !== division) return badRequest();

    const candidates = new Set(claims.bracket.slots.filter((s): s is string => s !== null));
    const run = verifyRun({ v: 1, division, bracket: claims.bracket, thirdPlace: claims.thirdPlace, picks: input.picks }, candidates);
    if (!run.ok) {
      return respond(422, { error: { code: "invalid_run", message: "끝까지 마친 대진만 집계할 수 있어요." }, reason: run.reason });
    }

    const result = await recordRun(deps.db, {
      claims,
      picks: run.state.picks,
      championId: run.placements[0].id,
      tally: run.tally,
      limit: { day, keyHash },
      now,
    });
    if (result.ok) return respond(200, { recorded: true, division });
    return result.reason === "duplicate" ? fail(409, "already_submitted", "이미 집계에 반영된 대진이에요.") : rateLimited(now);
  });
}

/** GET /api/awards/rankings?division= → { division, runs, minMatches, byChampionships, byWinRate }. secret이 필요 없다 */
export function handleRankings(req: Request, deps: AwardsDeps): Promise<Response> {
  return guarded(deps, async () => {
    const denied = await gate(req, deps);
    if (denied !== null) return denied;
    const division = parseDivision(new URL(req.url).searchParams.get("division"));
    if (division === null) return badRequest();
    const { runs, rows } = await loadRankingRows(deps.db, division, await loadPlayedDates(deps.db));
    return respond(200, { division, ...rankTally(runs, rows) });
  });
}

/** /awards 서버 컴포넌트용. 순위는 읽지 않는다(0013이 없어도 페이지는 열린다).
 *  부문 소속은 여기서 전체 게임(첫 플레이·마지막 플레이 저장값)으로 계산해 entry.divisions에 넣고, 직렬화되는 것은 entries뿐이다 */
export type AwardsPageResult = { kind: "ok"; entries: AwardEntry[] } | { kind: "denied" } | { kind: "error" };

export async function loadAwardsPage(deps: AwardsDeps, cookieHeader: string | null): Promise<AwardsPageResult> {
  try {
    if (awardsAccess(await sessionOf(deps, cookieHeader)) !== "ok") return { kind: "denied" };
    return { kind: "ok", entries: toAwardEntries(await listGames(deps.db, { includeHidden: false })) };
  } catch (error) {
    unexpected(deps, error);
    return { kind: "error" };
  }
}

/** /awards/rankings 서버 컴포넌트용. rankings null = 순위를 읽지 못함(0013 미적용 등, 페이지는 열고 실패 문구를 보인다).
 *  entries = 순위(우승·승률 목록)에 든 게임만(번호는 전체 목록 기준) */
export type AwardsRankingsPageResult =
  | { kind: "ok"; division: Division; rankings: Rankings | null; entries: AwardEntry[] }
  | { kind: "denied" }
  | { kind: "error" };

export async function loadAwardsRankingsPage(deps: AwardsDeps, cookieHeader: string | null, division: Division): Promise<AwardsRankingsPageResult> {
  let visible: GameRecord[];
  try {
    if (awardsAccess(await sessionOf(deps, cookieHeader)) !== "ok") return { kind: "denied" };
    visible = await listGames(deps.db, { includeHidden: false });
  } catch (error) {
    unexpected(deps, error);
    return { kind: "error" };
  }
  let rankings: Rankings | null;
  try {
    const { runs, rows } = await loadRankingRows(deps.db, division, visible);
    rankings = rankTally(runs, rows);
  } catch (error) {
    unexpected(deps, error);
    rankings = null;
  }
  const ranked = new Set(rankings === null ? [] : [...rankings.byChampionships, ...rankings.byWinRate].map((r) => r.id));
  // 번호(no)는 전체 목록 기준이라 거르기 전에 만든다
  const entries = toAwardEntries(visible).filter((e) => ranked.has(e.id));
  return { kind: "ok", division, rankings, entries };
}

// ---------- 포스터 중계 ----------

/** 중계하는 그림 한 장의 상한 */
export const POSTER_MAX_BYTES = 5 * 1024 * 1024;

/** GET /api/awards/poster?u=<치지직 포스터 주소>. /awards 3D 무대(WebGL)가 포스터를 텍스처로 쓰려면 같은 출처여야 하는데
 *  치지직 포스터(pstatic.net)는 CORS 헤더가 없다. 그래서 어워즈 권한(awardsGate)을 통과한 요청만, 치지직 포스터 주소(isChzzkPosterUrl)만,
 *  그림(image/*)이고 POSTER_MAX_BYTES 이하일 때만 그대로 돌려준다. 리다이렉트는 따라가지 않는다(다른 호스트로 새지 않게).
 *  Steam·유튜브 썸네일은 CORS가 열려 있어 중계하지 않는다(lib/awards/orbit stageTextureUrl). 로그에 주소를 남기지 않는다 */
export function handlePoster(req: Request, deps: AwardsDeps): Promise<Response> {
  return guarded(deps, async () => {
    const denied = await gate(req, deps);
    if (denied !== null) return denied;
    const target = new URL(req.url).searchParams.get("u");
    if (!isChzzkPosterUrl(target) || deps.fetch === undefined) return badRequest();
    // 리다이렉트는 따라가지 않는다. Workers fetch는 redirect "error"를 받지 않고 던지므로(운영에서 중계가 전부 500이었다, 2026-11-27)
    // "manual"로 받아 3xx를 아래 !upstream.ok로 실패 처리한다
    const raw: PosterFetchInit = { redirect: "manual", headers: { accept: "image/*" } };
    // 치지직 포스터는 300×400 PNG라 장당 약 180KB(벽 전체 약 20MB)였다. 브라우저가 WebP를 받으면 Cloudflare가 WebP로 바꿔 준다
    // (무료 플랜 월 5,000 고유 변환 포함, 같은 그림은 한 달에 한 번만 센다). 변환이 실패하면(한도 초과 9422 등) 원본으로 되돌린다
    const webp = (req.headers.get("accept") ?? "").includes("image/webp");
    let upstream = await deps.fetch(target, webp ? { ...raw, cf: { image: { format: "webp", quality: 80 } } } : raw);
    if (webp && !upstream.ok) upstream = await deps.fetch(target, raw);
    const type = upstream.headers.get("content-type") ?? "";
    const declared = Number(upstream.headers.get("content-length") ?? "0");
    const upstreamFailed = () => fail(502, "upstream_failed", "그림을 가져오지 못했어요.");
    if (!upstream.ok || !type.startsWith("image/") || declared > POSTER_MAX_BYTES) return upstreamFailed();
    const body = await upstream.arrayBuffer();
    if (body.byteLength > POSTER_MAX_BYTES) return upstreamFailed();
    // 관리자 전용이라 공유 캐시에 두지 않는다(private). 같은 브라우저는 하루 동안 다시 받지 않는다
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  });
}
