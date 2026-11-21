// 대결 카드 미디어 우선순위. PR2는 맨 앞에 하이라이트 영상(clip)을 끼운다.
import { fieldPhoto } from "../games/media.ts";
import type { AwardEntry } from "./types.ts";

export type CardMedia =
  | { kind: "poster"; url: string }
  | { kind: "photo"; url: string; date: string }
  | { kind: "specimen" };
// PR2: | { kind: "clip"; videoId: string; startSec: number } 를 맨 앞 우선순위로 추가

/** 포스터 → 현장 사진(fieldPhoto) → 표본 라벨. /games Poster.tsx의 표시 순서와 같다 */
export function cardMedia(entry: Pick<AwardEntry, "posterUrl" | "vods" | "name" | "originalTitle">): CardMedia {
  if (entry.posterUrl !== undefined) return { kind: "poster", url: entry.posterUrl };
  const photo = fieldPhoto(entry);
  return photo === null ? { kind: "specimen" } : { kind: "photo", url: photo.thumbnailUrl, date: photo.date };
}
