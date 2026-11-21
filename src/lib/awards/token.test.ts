import { describe, expect, it } from "vitest";
import { deriveAwardKeys } from "./keys.ts";
import {
  base64urlDecode,
  base64urlEncode,
  CLOCK_SKEW_SECONDS,
  DRAW_TTL_SECONDS,
  signDraw,
  TOKEN_MAX_CHARS,
  TOKEN_VERSION,
  verifyDraw,
  type DrawClaims,
} from "./token.ts";

const NOW = 1_792_900_000;
const ID = "0f8e7d6c-5b4a-4321-8fed-cba987654321";
const keyOf = async (s: string) => (await deriveAwardKeys(s))!.draw;
const KEY = await keyOf("k".repeat(32));
const enc = new TextEncoder();

const claims = (extra: Partial<DrawClaims> = {}): DrawClaims => ({
  drawId: ID,
  division: "alltime",
  bracket: { size: 4, slots: ["a", "b", "c", null] },
  thirdPlace: false,
  issuedAt: NOW,
  expiresAt: NOW + DRAW_TTL_SECONDS,
  ...extra,
});

/** payload 조각을 그대로 서명한 토큰(모양 검사 테스트용) */
async function signRaw(payloadB64: string, key: CryptoKey = KEY): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`v1.${payloadB64}`));
  return `v1.${payloadB64}.${base64urlEncode(new Uint8Array(sig))}`;
}
const b64json = (v: unknown) => base64urlEncode(enc.encode(JSON.stringify(v)));
const payload = (extra: Record<string, unknown> = {}) => ({
  v: 1,
  id: ID,
  d: "alltime",
  b: { size: 4, slots: ["a", "b", "c", null] },
  t: false,
  iat: NOW,
  exp: NOW + DRAW_TTL_SECONDS,
  ...extra,
});

describe("base64url", () => {
  it("패딩 없이 -_ 알파벳으로 왕복한다", () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xfe, 0x00, 0x10]);
    const s = base64urlEncode(bytes);
    expect(s).toBe("-__-ABA");
    expect(base64urlDecode(s)).toEqual(bytes);
    expect(base64urlEncode(new Uint8Array(0))).toBe("");
  });
  it("길이 4k+1·비정규 표현은 null", () => {
    expect(base64urlDecode("A")).toBeNull();
    expect(base64urlDecode("AAAAA")).toBeNull();
    // "AB"는 0x00에 남는 비트가 0이 아니다(정규형은 "AA")
    expect(base64urlDecode("AB")).toBeNull();
    expect(base64urlDecode("AA")).toEqual(new Uint8Array([0]));
  });
});

describe("signDraw / verifyDraw", () => {
  it("상수", () => {
    expect(TOKEN_VERSION).toBe("v1");
    expect(DRAW_TTL_SECONDS).toBe(86400);
    expect(CLOCK_SKEW_SECONDS).toBe(60);
    expect(TOKEN_MAX_CHARS).toBe(393_216);
  });

  it("왕복: 형식 v1.<payload>.<sig 43자>, payload 키 순서 고정", async () => {
    const c = claims({ division: "2026", thirdPlace: true, bracket: { size: 4, slots: ["a", "b", "c", "d"] } });
    const token = await signDraw(KEY, c);
    const [v, p, s] = token.split(".");
    expect(v).toBe("v1");
    expect(s).toHaveLength(43);
    expect(new TextDecoder().decode(base64urlDecode(p)!)).toBe(
      JSON.stringify({ v: 1, id: ID, d: "2026", b: c.bracket, t: true, iat: NOW, exp: NOW + DRAW_TTL_SECONDS }),
    );
    expect(await verifyDraw(KEY, token, NOW)).toEqual({ ok: true, claims: c });
  });

  it("변조·다른 secret → signature", async () => {
    const token = await signDraw(KEY, claims());
    const [, p, s] = token.split(".");
    const tampered = b64json(payload({ b: { size: 4, slots: ["a", "b", "zz", null] } }));
    expect(await verifyDraw(KEY, `v1.${tampered}.${s}`, NOW)).toEqual({ ok: false, reason: "signature" });
    const flipped = p.slice(0, 5) + (p[5] === "A" ? "B" : "A") + p.slice(6);
    expect((await verifyDraw(KEY, `v1.${flipped}.${s}`, NOW)).ok).toBe(false);
    const sigBytes = base64urlDecode(s)!;
    sigBytes[0] ^= 1;
    expect(await verifyDraw(KEY, `v1.${p}.${base64urlEncode(sigBytes)}`, NOW)).toEqual({ ok: false, reason: "signature" });
    expect(await verifyDraw(await keyOf("x".repeat(32)), token, NOW)).toEqual({ ok: false, reason: "signature" });
  });

  it("형식이 틀리면 malformed", async () => {
    const token = await signDraw(KEY, claims());
    const [, p, s] = token.split(".");
    const bad = [
      undefined,
      null,
      42,
      { token },
      "",
      `v2.${p}.${s}`,
      `v1.${p}`,
      `v1.${p}.${s}.x`,
      `v1.${p}.${s}=`,
      `v1.${p}+.${s}`,
      `v1..${s}`,
      `v1.${p}.`,
      `v1.${p}.${s.slice(0, 42)}`,
      `v1.${p}.${s}AA`,
      // 마지막 글자의 남는 비트가 0이 아닌 비정규 표현
      `v1.${p}.${s.slice(0, 42)}${s[42] === "A" ? "B" : String.fromCharCode(s.charCodeAt(42) + 1)}`,
      "x".repeat(TOKEN_MAX_CHARS + 1),
    ];
    for (const t of bad) expect(await verifyDraw(KEY, t, NOW), String(t).slice(0, 40)).toEqual({ ok: false, reason: "malformed" });
  });

  it("만료·발급 시각", async () => {
    const token = await signDraw(KEY, claims());
    expect((await verifyDraw(KEY, token, NOW + DRAW_TTL_SECONDS - 1)).ok).toBe(true);
    expect(await verifyDraw(KEY, token, NOW + DRAW_TTL_SECONDS)).toEqual({ ok: false, reason: "expired" });
    expect((await verifyDraw(KEY, token, NOW - 60)).ok).toBe(true);
    expect(await verifyDraw(KEY, token, NOW - 61)).toEqual({ ok: false, reason: "malformed" });
  });

  it("서명은 맞지만 payload가 틀리면 malformed", async () => {
    const raw = [
      // UTF-8이 아님
      base64urlEncode(new Uint8Array([0xff, 0xfe])),
      // JSON이 아님
      base64urlEncode(enc.encode("{nope")),
      // 비정규 base64url
      "AB",
      b64json(null),
      b64json([1]),
      b64json("s"),
      b64json(payload({ extra: 1 })),
      b64json(Object.fromEntries(Object.entries(payload()).filter(([k]) => k !== "t"))),
      b64json(payload({ v: 2 })),
      b64json(payload({ id: "not-a-uuid" })),
      b64json(payload({ id: ID.toUpperCase() })),
      b64json(payload({ id: 5 })),
      b64json(payload({ d: "1999" })),
      b64json(payload({ b: { size: 8, slots: ["a", "b", "c", "d", "e", "f", "g", "h"] } })),
      b64json(payload({ b: { size: 2, slots: ["a", "b"] } })),
      b64json(payload({ b: { size: 4, slots: ["a", "a", "c", "d"] } })),
      b64json(payload({ t: 1 })),
      b64json(payload({ iat: NOW + 0.5, exp: NOW + 0.5 + DRAW_TTL_SECONDS })),
      b64json(payload({ iat: "1" })),
      b64json(payload({ exp: NOW + DRAW_TTL_SECONDS + 1 })),
      b64json(payload({ exp: 1.5 })),
    ];
    for (const p of raw) expect(await verifyDraw(KEY, await signRaw(p), NOW), p.slice(0, 30)).toEqual({ ok: false, reason: "malformed" });
    // 직접 서명해도 올바른 payload면 통과(위 실패가 서명 때문이 아님을 확인)
    expect((await verifyDraw(KEY, await signRaw(b64json(payload())), NOW)).ok).toBe(true);
  });

  it("길이가 상한을 넘으면 signDraw가 RangeError", async () => {
    const slots = Array.from({ length: 1024 }, (_, i) => `${"g".repeat(400)}${i}`);
    await expect(signDraw(KEY, claims({ bracket: { size: 1024, slots } }))).rejects.toThrow(RangeError);
  });
});
