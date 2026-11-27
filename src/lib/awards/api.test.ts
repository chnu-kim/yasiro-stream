// 핸들러의 검사 순서·설정 오류·예외 경로. 시나리오 전체는 api.e2e.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGamesTestDb, FAKE_ADMIN_ID, FAKE_USER_ID, insertSession, type TestD1 } from "../games/test-d1.ts";
import type { SessionState } from "../games/types.ts";
import {
  AWARDS_PUBLIC,
  awardsAccess,
  awardsGate,
  awardsNavVisible,
  DRAW_BODY_MAX_BYTES,
  handleDraw,
  handlePoster,
  POSTER_MAX_BYTES,
  handleRankings,
  handleSubmit,
  SUBMIT_BODY_MAX_BYTES,
  type AwardsDeps,
} from "./api.ts";
import { deriveAwardKeys } from "./keys.ts";
import { ipBucket, kstDay, limitKeyHash } from "./limit.ts";

const NOW = 1_792_900_000;
const ORIGIN = "https://yasiro.stream";
const SECRET = "s".repeat(40);
const ADMIN = "a".repeat(64);
const USER = "c".repeat(64);

let d1: TestD1;
let logs: string[];

function deps(extra: Partial<AwardsDeps> = {}): AwardsDeps {
  return {
    db: d1.db,
    env: { ADMIN_CHANNEL_IDS: FAKE_ADMIN_ID, AWARDS_SECRET: SECRET },
    now: () => NOW,
    uuid: () => "00000000-0000-4000-8000-000000000001",
    rng: () => 0.5,
    log: (m) => logs.push(m),
    ...extra,
  };
}

function req(method: string, path: string, session: string | null, body?: string, headers: Record<string, string> = {}): Request {
  const h: Record<string, string> = { origin: ORIGIN, ...headers };
  if (session !== null) h.cookie = `__Host-session=${session}`;
  return new Request(`${ORIGIN}${path}`, { method, headers: h, body });
}

async function read(res: Response): Promise<{ status: number; code: string | undefined }> {
  expect(res.headers.get("cache-control")).toBe("no-store");
  const body = await res.json();
  return { status: res.status, code: body.error?.code };
}

const DRAW = JSON.stringify({ division: "alltime", size: 4, thirdPlace: false });

beforeEach(() => {
  d1 = createGamesTestDb();
  logs = [];
  insertSession(d1, { id: ADMIN, channelId: FAKE_ADMIN_ID, channelName: "실명", expiresAt: NOW + 1000 });
  insertSession(d1, { id: USER, channelId: FAKE_USER_ID, channelName: "시청자", expiresAt: NOW + 1000 });
  const ins = d1.sqlite.prepare("INSERT INTO games (id, name) VALUES (?, ?)");
  for (const id of ["a", "b", "c", "d"]) ins.run(id, id);
});

afterEach(() => {
  d1.close();
  vi.restoreAllMocks();
});

describe("awardsAccess / awardsGate", () => {
  const states: SessionState[] = [
    { kind: "anonymous" },
    { kind: "expired" },
    { kind: "user" },
    { kind: "admin", actor: { channelId: FAKE_ADMIN_ID, name: "관리자" } },
  ];
  it("지금은 관리자 전용(AWARDS_PUBLIC = false)", async () => {
    expect(AWARDS_PUBLIC).toBe(false);
    expect(states.map((s) => awardsAccess(s))).toEqual(["login_required", "session_expired", "forbidden", "ok"]);
    const gated = states.map((s) => awardsGate(s));
    expect(gated[3]).toBe("ok");
    expect(await Promise.all(gated.slice(0, 3).map((r) => read(r as Response)))).toEqual([
      { status: 401, code: "login_required" },
      { status: 401, code: "session_expired" },
      { status: 403, code: "forbidden" },
    ]);
  });
  it("공개로 바꾸면 누구나 ok", () => {
    expect(states.map((s) => awardsAccess(s, true))).toEqual(["ok", "ok", "ok", "ok"]);
    expect(states.map((s) => awardsGate(s, true))).toEqual(["ok", "ok", "ok", "ok"]);
  });
});

describe("awardsNavVisible", () => {
  it("지금은 허용 목록에 든 로그인 채널만 Nav에 어워즈가 보인다", () => {
    expect(awardsNavVisible(null, FAKE_ADMIN_ID)).toBe(false);
    expect(awardsNavVisible(FAKE_USER_ID, FAKE_ADMIN_ID)).toBe(false);
    expect(awardsNavVisible(FAKE_ADMIN_ID, FAKE_ADMIN_ID)).toBe(true);
    expect(awardsNavVisible(FAKE_ADMIN_ID, undefined)).toBe(false);
    // 야시로는 secret 없이도 관리자
    expect(awardsNavVisible("d6e680f5b17eba0b078f978dd722c0f3", undefined)).toBe(true);
  });
  it("공개로 바꾸면 비로그인에게도 보인다", () => {
    expect(awardsNavVisible(null, undefined, true)).toBe(true);
    expect(awardsNavVisible(FAKE_USER_ID, undefined, true)).toBe(true);
  });
});

describe("검사 순서", () => {
  it("상수", () => {
    expect(DRAW_BODY_MAX_BYTES).toBe(1024);
    expect(SUBMIT_BODY_MAX_BYTES).toBe(512 * 1024);
  });

  it("cross-origin이 인증보다 먼저", async () => {
    const evil = { origin: "https://evil.example" };
    expect(await read(await handleDraw(req("POST", "/api/awards/draw", null, DRAW, evil), deps()))).toEqual({ status: 403, code: "cross_origin" });
    expect(await read(await handleSubmit(req("POST", "/api/awards/submit?division=alltime", null, "{}", evil), deps()))).toEqual({ status: 403, code: "cross_origin" });
  });

  it("권한이 secret 검사보다 먼저", async () => {
    const noSecret = deps({ env: { ADMIN_CHANNEL_IDS: FAKE_ADMIN_ID } });
    expect(await read(await handleDraw(req("POST", "/api/awards/draw", USER, DRAW), noSecret))).toEqual({ status: 403, code: "forbidden" });
    expect(await read(await handleSubmit(req("POST", "/api/awards/submit?division=alltime", null, "{}"), noSecret))).toEqual({ status: 401, code: "login_required" });
    expect(logs).toEqual([]);
  });

  it("secret이 없거나 짧으면 draw·submit 503 + 로그 한 줄(값 없음). secret이 쿼리 부문 검사보다 먼저", async () => {
    for (const AWARDS_SECRET of [undefined, "", "short-secret-value"]) {
      logs = [];
      const d = deps({ env: { ADMIN_CHANNEL_IDS: FAKE_ADMIN_ID, AWARDS_SECRET } });
      const drawRes = await handleDraw(req("POST", "/api/awards/draw", ADMIN, DRAW), d);
      expect(await drawRes.clone().json()).toEqual({ error: { code: "unconfigured", message: "어워즈 설정이 끝나지 않았어요." } });
      expect(await read(drawRes)).toEqual({ status: 503, code: "unconfigured" });
      expect(await read(await handleSubmit(req("POST", "/api/awards/submit?division=bad", ADMIN, "{}"), d))).toEqual({ status: 503, code: "unconfigured" });
      expect(logs).toEqual(["awards-api secret missing", "awards-api secret missing"]);
    }
    expect(logs.join()).not.toContain("short-secret-value");
  });

  it("제출 한도 초과가 본문 크기(413)보다 먼저", async () => {
    const d = deps();
    const first = await handleSubmit(req("POST", "/api/awards/submit?division=alltime", ADMIN, "x".repeat(SUBMIT_BODY_MAX_BYTES + 1), { "cf-connecting-ip": "198.51.100.1" }), d);
    expect(await read(first)).toEqual({ status: 413, code: "payload_too_large" });
    // 그 IP·부문의 오늘 행을 한도까지 올려 둔다
    const hash = await limitKeyHash((await deriveAwardKeys(SECRET))!.limit, kstDay(NOW), ipBucket("198.51.100.1"));
    d1.sqlite.prepare("INSERT INTO award_limits (day, key_hash, division, count) VALUES (?, ?, 'alltime', 10)").run(kstDay(NOW), hash);
    const big = await handleSubmit(req("POST", "/api/awards/submit?division=alltime", ADMIN, "x".repeat(SUBMIT_BODY_MAX_BYTES + 1), { "cf-connecting-ip": "198.51.100.1" }), d);
    expect(big.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await read(big)).toEqual({ status: 429, code: "rate_limited" });
    // 다른 부문은 그대로 413
    const other = await handleSubmit(req("POST", "/api/awards/submit?division=2026", ADMIN, "x".repeat(SUBMIT_BODY_MAX_BYTES + 1), { "cf-connecting-ip": "198.51.100.1" }), d);
    expect(await read(other)).toEqual({ status: 413, code: "payload_too_large" });
  });
});

describe("예외 경로", () => {
  it("DB 예외 → 500 unavailable + 로그(error.name만)", async () => {
    const broken = vi.fn(() => {
      throw new Error("no such table: award_limits");
    });
    const d = deps({ db: { prepare: broken, batch: broken } });
    for (const res of [
      await handleDraw(req("POST", "/api/awards/draw", ADMIN, DRAW), d),
      await handleSubmit(req("POST", "/api/awards/submit?division=alltime", ADMIN, "{}"), d),
      await handleRankings(req("GET", "/api/awards/rankings?division=alltime", ADMIN), d),
    ]) {
      expect(await read(res)).toEqual({ status: 500, code: "unavailable" });
    }
    expect(logs).toEqual(Array(3).fill("awards-api unavailable Error"));
  });

  it("던진 값이 Error가 아니면 이름 unknown", async () => {
    const d = deps({
      db: {
        prepare: () => {
          throw "nope";
        },
        batch: async () => [],
      },
    });
    expect(await read(await handleRankings(req("GET", "/api/awards/rankings?division=alltime", ADMIN), d))).toEqual({ status: 500, code: "unavailable" });
    expect(logs).toEqual(["awards-api unavailable unknown"]);
  });

  it("토큰이 상한을 넘으면 500 + 로그 token too large", async () => {
    const ins = d1.sqlite.prepare("INSERT INTO games (id, name) VALUES (?, ?)");
    for (let i = 0; i < 1024; i++) ins.run(`${"g".repeat(400)}${i}`, `게임${i}`);
    const body = JSON.stringify({ division: "alltime", size: 1024, thirdPlace: false });
    expect(await read(await handleDraw(req("POST", "/api/awards/draw", ADMIN, body), deps({ rng: Math.random })))).toEqual({ status: 500, code: "unavailable" });
    expect(logs).toEqual(["awards-api token too large"]);
  });

  it("서명 중 다른 예외는 일반 500", async () => {
    // 앞의 두 번(키 파생)은 그대로, 세 번째(signDraw)만 실패
    const original = crypto.subtle.sign.bind(crypto.subtle);
    let calls = 0;
    vi.spyOn(crypto.subtle, "sign").mockImplementation((...args: Parameters<SubtleCrypto["sign"]>) =>
      ++calls === 3 ? Promise.reject(new TypeError("boom")) : original(...args),
    );
    expect(await read(await handleDraw(req("POST", "/api/awards/draw", ADMIN, DRAW), deps()))).toEqual({ status: 500, code: "unavailable" });
    expect(logs).toEqual(["awards-api unavailable TypeError"]);
  });

  it("log가 없어도 동작한다", async () => {
    const d = deps({ log: undefined, env: { ADMIN_CHANNEL_IDS: FAKE_ADMIN_ID } });
    expect(await read(await handleDraw(req("POST", "/api/awards/draw", ADMIN, DRAW), d))).toEqual({ status: 503, code: "unconfigured" });
    const broken = () => {
      throw new Error("x");
    };
    expect(await read(await handleRankings(req("GET", "/api/awards/rankings?division=alltime", ADMIN), deps({ log: undefined, db: { prepare: broken, batch: broken } })))).toEqual({
      status: 500,
      code: "unavailable",
    });
  });
});

describe("handlePoster", () => {
  const POSTER = "https://nng-phinf.pstatic.net/MjAy/poster.png";
  const url = (u: string) => `/api/awards/poster?u=${encodeURIComponent(u)}`;
  const png = (headers: Record<string, string> = {}, body: BodyInit = new Uint8Array([1, 2, 3]), status = 200) =>
    new Response(body, { status, headers: { "content-type": "image/png", ...headers } });

  it("관리자 + 치지직 포스터면 그림을 그대로 돌려준다(private 캐시, 리다이렉트 안 따라감)", async () => {
    const calls: { input: string; init?: RequestInit }[] = [];
    const res = await handlePoster(
      req("GET", url(POSTER), ADMIN),
      deps({ fetch: async (input, init) => (calls.push({ input, init }), png()) }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls).toEqual([{ input: POSTER, init: { redirect: "error", headers: { accept: "image/*" } } }]);
  });

  it("권한이 없으면 가져오지 않는다", async () => {
    const fetch = vi.fn();
    expect(await read(await handlePoster(req("GET", url(POSTER), null), deps({ fetch })))).toEqual({ status: 401, code: "login_required" });
    expect(await read(await handlePoster(req("GET", url(POSTER), USER), deps({ fetch })))).toEqual({ status: 403, code: "forbidden" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("치지직 포스터가 아니거나 주소가 없거나 fetch가 없으면 400", async () => {
    const fetch = vi.fn();
    for (const path of [url("https://example.com/a.png"), url("http://nng-phinf.pstatic.net/a.png"), url("https://shared.akamai.steamstatic.com/a.jpg"), "/api/awards/poster"]) {
      expect(await read(await handlePoster(req("GET", path, ADMIN), deps({ fetch })))).toEqual({ status: 400, code: "bad_request" });
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(await read(await handlePoster(req("GET", url(POSTER), ADMIN), deps()))).toEqual({ status: 400, code: "bad_request" });
  });

  it("실패 응답·그림이 아님·크기 초과(선언·실제)는 502", async () => {
    const big = new Uint8Array(POSTER_MAX_BYTES + 1);
    for (const upstream of [
      png({}, "x", 404),
      png({ "content-type": "text/html" }),
      new Response(new Uint8Array([1]), { status: 200 }),
      png({ "content-length": String(POSTER_MAX_BYTES + 1) }),
      png({}, big),
    ]) {
      const res = await handlePoster(req("GET", url(POSTER), ADMIN), deps({ fetch: async () => upstream }));
      expect(await read(res)).toEqual({ status: 502, code: "upstream_failed" });
    }
  });

  it("가져오다 던지면(리다이렉트 포함) 500, 로그에 주소 없음", async () => {
    const res = await handlePoster(
      req("GET", url(POSTER), ADMIN),
      deps({
        fetch: async () => {
          throw new TypeError("redirect");
        },
      }),
    );
    expect(await read(res)).toEqual({ status: 500, code: "unavailable" });
    expect(logs).toEqual(["awards-api unavailable TypeError"]);
  });
});
