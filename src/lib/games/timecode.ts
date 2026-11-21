// 하이라이트 시작 시각: 사람이 적은 시각("1:23:45"·"83:20"·"45"·"1h23m45s") ↔ 초. 순수 함수.
// 검증 정본은 schema.ts(isHighlightStart, 숫자만)다. 폼(patch.ts)과 games:edit highlight op(ops.ts)가 이 파서를 부른다.
import { HIGHLIGHT_MAX } from "./schema.ts";

const SECONDS = /^(\d+)$/;
const MIN_SEC = /^(\d+):([0-5]\d)$/;
const HOUR_MIN_SEC = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/;
/** 유튜브 t= 꼴. m·s는 0~59로 제한하지 않고 합산한다("75m") */
const UNITS = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;

function total(h: string | undefined, m: string | undefined, s: string | undefined): number {
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

function seconds(t: string): number | null {
  let m = SECONDS.exec(t);
  if (m !== null) return Number(m[1]);
  m = MIN_SEC.exec(t);
  if (m !== null) return total(undefined, m[1], m[2]);
  m = HOUR_MIN_SEC.exec(t);
  if (m !== null) return total(m[1], m[2], m[3]);
  m = UNITS.exec(t);
  // 빈 문자열도 UNITS와 맞는다(셋 다 선택). 하나 이상 있어야 한다
  if (m !== null && t !== "") return total(m[1], m[2], m[3]);
  return null;
}

/** 사람이 적은 시각 → 초. 못 읽거나 범위(0..HIGHLIGHT_MAX) 밖이면 null. 빈 문자열도 null(호출자가 먼저 "없음"으로 처리) */
export function parseTimecode(raw: string): number | null {
  const sec = seconds(raw.normalize("NFKC").trim());
  return sec !== null && Number.isSafeInteger(sec) && sec <= HIGHLIGHT_MAX ? sec : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 초 → "M:SS"(1시간 미만) 또는 "H:MM:SS". 검증된 값(0..HIGHLIGHT_MAX 정수)만 넣는다 */
export function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
