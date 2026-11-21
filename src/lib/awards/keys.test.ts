import { describe, expect, it } from "vitest";
import { deriveAwardKeys, KEY_LABEL_DRAW, KEY_LABEL_LIMIT, SECRET_MIN_LENGTH } from "./keys.ts";

const SECRET = "s".repeat(SECRET_MIN_LENGTH);
const data = new TextEncoder().encode("hello");
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

describe("deriveAwardKeys", () => {
  it("secret이 없거나 짧으면 null", async () => {
    expect(SECRET_MIN_LENGTH).toBe(32);
    for (const s of [undefined, "", "a".repeat(31), " ".repeat(32), ` ${"a".repeat(30)} `]) {
      expect(await deriveAwardKeys(s), JSON.stringify(s)).toBeNull();
    }
  });

  it("32자 이상이면 HMAC 키 두 개", async () => {
    const keys = await deriveAwardKeys(SECRET);
    expect(keys).not.toBeNull();
    expect(keys!.draw.algorithm).toMatchObject({ name: "HMAC", hash: { name: "SHA-256" } });
    expect(keys!.draw.extractable).toBe(false);
    expect(keys!.limit.usages.sort()).toEqual(["sign", "verify"]);
  });

  it("파생: HMAC-SHA256(secret, 라벨)을 키로 쓴다", async () => {
    const keys = (await deriveAwardKeys(SECRET))!;
    const root = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    for (const [label, key] of [[KEY_LABEL_DRAW, keys.draw], [KEY_LABEL_LIMIT, keys.limit]] as const) {
      const sub = await crypto.subtle.sign("HMAC", root, new TextEncoder().encode(label));
      const expected = await crypto.subtle.importKey("raw", sub, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      expect(hex(await crypto.subtle.sign("HMAC", key, data))).toBe(hex(await crypto.subtle.sign("HMAC", expected, data)));
    }
  });

  it("같은 secret이면 같은 서명, 앞뒤 공백은 무시, 라벨이 다르면 다른 키", async () => {
    const a = (await deriveAwardKeys(SECRET))!;
    const b = (await deriveAwardKeys(`  ${SECRET}\n`))!;
    const sigA = await crypto.subtle.sign("HMAC", a.draw, data);
    expect(hex(await crypto.subtle.sign("HMAC", b.draw, data))).toBe(hex(sigA));
    expect(await crypto.subtle.verify("HMAC", a.limit, sigA, data)).toBe(false);
    const other = (await deriveAwardKeys("t".repeat(32)))!;
    expect(await crypto.subtle.verify("HMAC", other.draw, sigA, data)).toBe(false);
  });
});
