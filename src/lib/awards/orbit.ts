// 설정 화면 "후보들의 궤도": 트로피 둘레를 도는 그림을 고른다. 그림이 있는 후보만(포스터 먼저, 모자라면 현장 사진),
// 목록 전체에서 고르게 띄엄띄엄 뽑아(최신 게임만 몰리지 않게) 같은 간격의 각도를 준다. 결정적이다(같은 입력 → 같은 출력).
import { isChzzkPosterUrl } from "../games/schema.ts";
import { stillMedia } from "./media.ts";
import type { AwardEntry } from "./types.ts";

export interface OrbitItem {
  id: string;
  url: string;
  /** 궤도 위 출발 각도(도). 0 = 정면. 반 칸 비켜 놓아 멈춘 고리(동작 줄이기)에서 정면 한가운데(트로피 앞)가 비어 있다 */
  angle: number;
}

type OrbitSource = Pick<AwardEntry, "id" | "posterUrl" | "vods" | "name" | "originalTitle">;

export function orbitItems(entries: readonly OrbitSource[], max: number): OrbitItem[] {
  const posters: { id: string; url: string }[] = [];
  const photos: { id: string; url: string }[] = [];
  for (const e of entries) {
    const m = stillMedia(e);
    if (m.kind === "poster") posters.push({ id: e.id, url: m.url });
    else if (m.kind === "photo") photos.push({ id: e.id, url: m.url });
  }
  const pool = posters.length >= max ? posters : [...posters, ...photos];
  const n = Math.max(0, Math.min(max, pool.length));
  return Array.from({ length: n }, (_, i) => ({ ...pool[Math.floor((i * pool.length) / n)], angle: (360 * (i + 0.5)) / n }));
}

/** 3D 무대(WebGL)에서 텍스처로 읽을 주소. 치지직 포스터는 CORS 헤더가 없어 같은 출처 중계(/api/awards/poster)를 거치고,
 *  Steam 캡슐·유튜브 썸네일은 CORS가 열려 있어 그대로 쓴다 */
export function stageTextureUrl(url: string): string {
  // v: 중계 응답 판(브라우저 하루 캐시를 넘기려고 응답이 바뀌면 올린다. 2 = WebP 변환, 2026-11-27). 서버는 u만 읽는다
  return isChzzkPosterUrl(url) ? `/api/awards/poster?u=${encodeURIComponent(url)}&v=2` : url;
}

/** 그림을 targetAspect(가로/세로) 칸에 object-fit: cover로 채우는 텍스처 repeat·offset(UV 0~1). 넘치는 쪽을 가운데 기준으로 자른다 */
export function coverCrop(width: number, height: number, targetAspect: number): { repeatX: number; repeatY: number; offsetX: number; offsetY: number } {
  const aspect = width / height;
  if (!(aspect > 0) || !Number.isFinite(aspect)) return { repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0 };
  if (aspect > targetAspect) {
    const repeatX = targetAspect / aspect;
    return { repeatX, repeatY: 1, offsetX: (1 - repeatX) / 2, offsetY: 0 };
  }
  const repeatY = aspect / targetAspect;
  return { repeatX: 1, repeatY, offsetX: 0, offsetY: (1 - repeatY) / 2 };
}
