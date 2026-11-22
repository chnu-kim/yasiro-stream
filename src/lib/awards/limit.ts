// 제출 횟수 제한: IP 버킷(IPv6는 /64) × 부문 × KST 날짜마다 하루 SUBMIT_LIMIT_PER_DAY회.
// IP 원문은 저장하지 않는다. HMAC(파생 키, "<day>|<버킷>")만 award_limits에 들어간다. 로그에도 남기지 않는다.
export const SUBMIT_LIMIT_PER_DAY = 10;
export const KST_OFFSET_SECONDS = 9 * 3600;
const DAY_SECONDS = 86400;

/** KST 날짜 번호. floor((now + 32400) / 86400). 경계: UTC 15:00:00 */
export function kstDay(now: number): number {
  return Math.floor((now + KST_OFFSET_SECONDS) / DAY_SECONDS);
}

/** 다음 KST 자정까지 남은 초(1 이상). 429 Retry-After */
export function secondsUntilNextKstDay(now: number): number {
  return (kstDay(now) + 1) * DAY_SECONDS - KST_OFFSET_SECONDS - now;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEXTET = /^[0-9a-f]{1,4}$/;

function parseIpv4(raw: string): number[] | null {
  const m = IPV4.exec(raw);
  if (m === null) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

/** 8개 hextet. 끝의 점 표기 IPv4는 hextet 두 개로 바꾼다 */
function parseIpv6(raw: string): number[] | null {
  let s = raw.toLowerCase();
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (v4 === null) return null;
    s = `${s.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const split = (part: string) => (part === "" ? [] : part.split(":"));
  const head = split(halves[0]);
  const rest = halves.length === 2 ? split(halves[1]) : [];
  const count = head.length + rest.length;
  if (![...head, ...rest].every((g) => HEXTET.test(g))) return null;
  if (halves.length === 1 ? count !== 8 : count > 7) return null;
  return [...head, ...Array<string>(8 - count).fill("0"), ...rest].map((g) => parseInt(g, 16));
}

/** IP 문자열 → 버킷. IPv4는 정규화한 주소, IPv6는 앞 4 hextet + "::/64", IPv4-mapped는 IPv4.
 *  헤더 없음(null)·파싱 실패는 "unknown"(한 버킷 공유) */
export function ipBucket(raw: string | null): string {
  if (raw === null) return "unknown";
  if (!raw.includes(":")) return parseIpv4(raw)?.join(".") ?? "unknown";
  const h = parseIpv6(raw);
  if (h === null) return "unknown";
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return [h[6] >> 8, h[6] & 255, h[7] >> 8, h[7] & 255].join(".");
  return `${h.slice(0, 4).map((x) => x.toString(16)).join(":")}::/64`;
}

/** hex(HMAC-SHA256(keys.limit, `${day}|${bucket}`)) 64자 */
export async function limitKeyHash(key: CryptoKey, day: number, bucket: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${day}|${bucket}`)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}
