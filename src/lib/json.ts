/** 배열·null이 아닌 객체(JSON 객체 모양). 프로토타입은 검사하지 않는다 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
