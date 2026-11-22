import { describe, expect, it } from "vitest";
import { deriveAwardKeys } from "./keys.ts";
import { ipBucket, KST_OFFSET_SECONDS, kstDay, limitKeyHash, secondsUntilNextKstDay, SUBMIT_LIMIT_PER_DAY } from "./limit.ts";

// 2026-11-22T15:00:00Z = 2026-11-23 00:00 KST
const KST_MIDNIGHT = Date.UTC(2026, 10, 22, 15, 0, 0) / 1000;

describe("kstDay", () => {
  it("상수", () => {
    expect(SUBMIT_LIMIT_PER_DAY).toBe(10);
    expect(KST_OFFSET_SECONDS).toBe(32400);
  });
  it("경계는 UTC 15:00:00", () => {
    const d = kstDay(KST_MIDNIGHT);
    expect(kstDay(KST_MIDNIGHT - 1)).toBe(d - 1);
    expect(kstDay(KST_MIDNIGHT + 86399)).toBe(d);
    expect(kstDay(KST_MIDNIGHT + 86400)).toBe(d + 1);
    expect(d).toBe(Math.floor((KST_MIDNIGHT + 32400) / 86400));
  });
  it("다음 KST 자정까지 남은 초", () => {
    expect(secondsUntilNextKstDay(KST_MIDNIGHT - 1)).toBe(1);
    expect(secondsUntilNextKstDay(KST_MIDNIGHT)).toBe(86400);
    expect(secondsUntilNextKstDay(KST_MIDNIGHT + 3600)).toBe(82800);
  });
});

describe("ipBucket", () => {
  it("IPv4는 정규화한 주소 그대로", () => {
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("010.001.000.255")).toBe("10.1.0.255");
  });
  it("IPv6는 /64", () => {
    expect(ipBucket("2001:0db8:0000:0042:0000:8a2e:0370:7334")).toBe("2001:db8:0:42::/64");
    expect(ipBucket("2001:DB8::42:1")).toBe("2001:db8:0:0::/64");
    expect(ipBucket("2001:db8:0:42::1")).toBe("2001:db8:0:42::/64");
    expect(ipBucket("2001:db8:0:42:ffff::9")).toBe(ipBucket("2001:db8:0:42:1:2:3:4"));
    expect(ipBucket("::1")).toBe("0:0:0:0::/64");
    expect(ipBucket("::")).toBe("0:0:0:0::/64");
    expect(ipBucket("fe80::")).toBe("fe80:0:0:0::/64");
    expect(ipBucket("2001:db8:1:2:3:4:1.2.3.4")).toBe("2001:db8:1:2::/64");
  });
  it("IPv4-mapped는 IPv4", () => {
    expect(ipBucket("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(ipBucket("::FFFF:0102:0304")).toBe("1.2.3.4");
    expect(ipBucket("0:0:0:0:0:ffff:203.0.113.7")).toBe("203.0.113.7");
  });
  it("헤더 없음·파싱 실패는 unknown", () => {
    for (const raw of [
      null,
      "",
      "abc",
      "1.2.3",
      "1.2.3.4.5",
      "256.1.1.1",
      "1.2.3.4 ",
      "1.2.3.0004",
      "1::2::3",
      "1:2:3:4:5:6:7",
      "1:2:3:4:5:6:7:8:9",
      "1:2:3:4::5:6:7:8",
      ":1:2:3:4:5:6:7",
      "12345::",
      "g::1",
      "fe80::1%eth0",
      "::ffff:1.2.3.256",
      "::1.2.3.4:5",
    ]) {
      expect(ipBucket(raw), String(raw)).toBe("unknown");
    }
  });
});

describe("limitKeyHash", () => {
  it("64자 hex, day·버킷이 다르면 다른 값, 같은 입력이면 같은 값", async () => {
    const key = (await deriveAwardKeys("k".repeat(32)))!.limit;
    const h = await limitKeyHash(key, 100, "203.0.113.7");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await limitKeyHash(key, 100, "203.0.113.7")).toBe(h);
    expect(await limitKeyHash(key, 101, "203.0.113.7")).not.toBe(h);
    expect(await limitKeyHash(key, 100, "203.0.113.8")).not.toBe(h);
    const raw = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("100|203.0.113.7")));
    expect(h).toBe([...raw].map((b) => b.toString(16).padStart(2, "0")).join(""));
  });
});
