// /awards 비밀 키. Worker secret AWARDS_SECRET 하나에서 용도마다 HMAC(secret, 라벨)로 키를 파생한다.
// secret 값은 로그·응답·에러 메시지에 넣지 않는다.
export const SECRET_MIN_LENGTH = 32;
export const KEY_LABEL_DRAW = "yasiro-awards:draw-token:v1";
export const KEY_LABEL_LIMIT = "yasiro-awards:submit-limit:v1";

export interface AwardKeys {
  /** 대진 토큰 서명 */
  draw: CryptoKey;
  /** 제출 제한 IP 해시(pepper) */
  limit: CryptoKey;
}

const HMAC = { name: "HMAC", hash: "SHA-256" } as const;
const utf8 = (s: string) => new TextEncoder().encode(s);

/** secret이 없거나(undefined·빈 문자열) trim 후 32자 미만이면 null(핸들러가 503). 앞뒤 공백은 키에 넣지 않는다.
 *  요청마다 새로 파생한다(캐시 없음) */
export async function deriveAwardKeys(secret: string | undefined): Promise<AwardKeys | null> {
  const value = (secret ?? "").trim();
  if (value.length < SECRET_MIN_LENGTH) return null;
  const root = await crypto.subtle.importKey("raw", utf8(value), HMAC, false, ["sign"]);
  const derive = async (label: string) =>
    crypto.subtle.importKey("raw", await crypto.subtle.sign("HMAC", root, utf8(label)), HMAC, false, ["sign", "verify"]);
  return { draw: await derive(KEY_LABEL_DRAW), limit: await derive(KEY_LABEL_LIMIT) };
}
