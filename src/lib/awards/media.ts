// 대결 카드 미디어 우선순위: 하이라이트 재생(clip) → 포스터 → 현장 사진 → 표본 라벨.
import { fieldPhoto, highlightVod } from "../games/media.ts";
import type { AwardEntry } from "./types.ts";

/** 카드에 그리는 정지 그림 */
export type StillMedia =
  | { kind: "poster"; url: string }
  | { kind: "photo"; url: string; date: string }
  | { kind: "specimen" };

export type CardMedia =
  | StillMedia
  /** 하이라이트 재생. 정지 그림은 still(재생 영상의 썸네일은 여러 게임 방송이면 다른 게임 장면일 수 있어 쓰지 않는다) */
  | { kind: "clip"; videoId: string; startSec: number; date: string; still: StillMedia };

type MediaSource = Pick<AwardEntry, "posterUrl" | "vods" | "name" | "originalTitle">;

/** 포스터 → 현장 사진(fieldPhoto) → 표본 라벨. /games Poster.tsx의 표시 순서와 같다 */
export function stillMedia(entry: MediaSource): StillMedia {
  if (entry.posterUrl !== undefined) return { kind: "poster", url: entry.posterUrl };
  const photo = fieldPhoto(entry);
  return photo === null ? { kind: "specimen" } : { kind: "photo", url: photo.thumbnailUrl, date: photo.date };
}

/** 시작 시각이 적힌 다시보기(highlightVod)가 있으면 clip(정지 그림은 stillMedia), 없으면 stillMedia.
 *  시각이 없는 다시보기는 처음부터 틀지 않는다(여러 게임 방송이면 엉뚱한 장면) */
export function cardMedia(entry: MediaSource): CardMedia {
  const still = stillMedia(entry);
  const clip = highlightVod(entry);
  return clip === null ? still : { kind: "clip", videoId: clip.videoId, startSec: clip.startSec, date: clip.vod.date, still };
}

/** 하이라이트 임베드 주소(쿠키 없는 도메인, 그 시각부터 자동 재생) */
export function highlightEmbedUrl(videoId: string, startSec: number): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?start=${startSec}&autoplay=1&playsinline=1&rel=0`;
}
