// 서버가 뽑은 대진의 서명 토큰. 무상태: D1에 쓰지 않고, 제출 때 서명·만료로 그 대진이 서버가 낸 것인지 확인한다.
// 형식 v1.<payload b64url>.<HMAC-SHA256 b64url>. 서명 확인은 crypto.subtle.verify(상수 시간)로만 한다.
import { DIVISIONS } from "./entries.ts";
import { SIZE_LADDER } from "./options.ts";
import { isValidBracket } from "./verify.ts";
import type { Bracket, Division } from "./types.ts";

export const TOKEN_VERSION = "v1";
/** 24시간: 512강(511판)을 영상 보며 해도 남는 시간 */
export const DRAW_TTL_SECONDS = 86400;
export const CLOCK_SKEW_SECONDS = 60;
/** 384 KiB. 이보다 긴 문자열은 디코딩 전에 거부 */
export const TOKEN_MAX_CHARS = 393_216;

export interface DrawClaims {
  /** crypto.randomUUID()(소문자 uuid v4) */
  drawId: string;
  division: Division;
  bracket: Bracket;
  /** 실제로 3·4위전을 하는가(startTournament가 정한 값) */
  thirdPlace: boolean;
  /** unix seconds */
  issuedAt: number;
  /** issuedAt + DRAW_TTL_SECONDS */
  expiresAt: number;
}

export type TokenCheck = { ok: true; claims: DrawClaims } | { ok: false; reason: "malformed" | "signature" | "expired" };

const PAYLOAD_KEYS = ["b", "d", "exp", "iat", "id", "t", "v"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
const SIG_CHARS = 43;

export function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 알파벳은 호출부가 B64URL로 확인한다. 길이 4k+1이거나 다시 인코딩해 입력과 다르면(비정규 표현) null */
export function base64urlDecode(s: string): Uint8Array<ArrayBuffer> | null {
  if (s.length % 4 === 1) return null;
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  const out = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return base64urlEncode(out) === s ? out : null;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

/** 결과가 TOKEN_MAX_CHARS를 넘으면 RangeError(핸들러가 500) */
export async function signDraw(key: CryptoKey, claims: DrawClaims): Promise<string> {
  const payload = {
    v: 1,
    id: claims.drawId,
    d: claims.division,
    b: { size: claims.bracket.size, slots: claims.bracket.slots },
    t: claims.thirdPlace,
    iat: claims.issuedAt,
    exp: claims.expiresAt,
  };
  const head = `${TOKEN_VERSION}.${base64urlEncode(utf8(JSON.stringify(payload)))}`;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(head)));
  const token = `${head}.${base64urlEncode(sig)}`;
  if (token.length > TOKEN_MAX_CHARS) throw new RangeError(`draw token too large: ${token.length}`);
  return token;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 서명이 맞은 payload의 모양 검사. 틀리면 null */
function toClaims(value: unknown): DrawClaims | null {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== PAYLOAD_KEYS.length || keys.some((k, i) => k !== PAYLOAD_KEYS[i])) return null;
  const { v, id, d, b, t, iat, exp } = value;
  if (v !== 1 || typeof id !== "string" || !UUID.test(id)) return null;
  if (!DIVISIONS.includes(d as Division)) return null;
  if (!isValidBracket(b) || !SIZE_LADDER.includes(b.size)) return null;
  if (typeof t !== "boolean") return null;
  if (!Number.isSafeInteger(iat) || !Number.isSafeInteger(exp) || exp !== (iat as number) + DRAW_TTL_SECONDS) return null;
  return { drawId: id, division: d as Division, bracket: { size: b.size, slots: [...b.slots] }, thirdPlace: t, issuedAt: iat as number, expiresAt: exp as number };
}

/** 검증 순서: 형식 → 서명(상수 시간) → payload 디코딩 → 모양 → 발급 시각(미래면 malformed) → 만료 */
export async function verifyDraw(key: CryptoKey, token: unknown, now: number): Promise<TokenCheck> {
  const malformed: TokenCheck = { ok: false, reason: "malformed" };
  if (typeof token !== "string" || token.length > TOKEN_MAX_CHARS) return malformed;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION || !B64URL.test(parts[1]) || !B64URL.test(parts[2])) return malformed;
  const [, payloadB64, sigB64] = parts;
  const sig = sigB64.length === SIG_CHARS ? base64urlDecode(sigB64) : null;
  if (sig === null) return malformed;
  if (!(await crypto.subtle.verify("HMAC", key, sig, utf8(`${TOKEN_VERSION}.${payloadB64}`)))) return { ok: false, reason: "signature" };
  const bytes = base64urlDecode(payloadB64);
  if (bytes === null) return malformed;
  let claims: DrawClaims | null;
  try {
    claims = toClaims(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch {
    return malformed;
  }
  if (claims === null || claims.issuedAt > now + CLOCK_SKEW_SECONDS) return malformed;
  if (now >= claims.expiresAt) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}
