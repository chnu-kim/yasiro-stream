// 핸들러의 검사 순서·설정 오류·예외 경로. 시나리오 전체는 api.e2e.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGamesTestDb, FAKE_ADMIN_ID, FAKE_USER_ID, insertSession, type TestD1 } from "../games/test-d1.ts";
import type { SessionState } from "../games/types.ts";
import {
  AWARDS_PUBLIC,
  awardsAccess,
  awardsGate,
  DRAW_BODY_MAX_BYTES,
  handleDraw,
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
