import { describe, expect, it } from "vitest";
import { cardMedia, highlightEmbedUrl, stillMedia } from "./media.ts";
import type { Vod } from "../games/types.ts";

const POSTER = "https://nng-phinf.pstatic.net/x.png";
const solo: Vod = { title: "이름 했어요 [ 2026. 03. 01 ]", url: "https://www.youtube.com/watch?v=WAB1r0yczck", date: "2026-03-01" };
const multi: Vod = { title: "다른 게임 하고 이름 했어요", url: "https://www.youtube.com/watch?v=AAAAAAAAAAA", date: "2026-02-01" };

describe("cardMedia", () => {
  it("포스터 있음 → poster", () => {
    expect(cardMedia({ name: "이름", posterUrl: POSTER, vods: [] })).toEqual({ kind: "poster", url: POSTER });
  });
  it("포스터 있음 + 다시보기 → poster", () => {
    expect(cardMedia({ name: "이름", posterUrl: POSTER, vods: [solo] })).toEqual({ kind: "poster", url: POSTER });
  });
  it("포스터 없음 + 단독 다시보기 → photo(날짜 포함)", () => {
    expect(cardMedia({ name: "이름", vods: [solo] })).toEqual({
      kind: "photo",
      url: "https://i.ytimg.com/vi/WAB1r0yczck/hqdefault.jpg",
      date: "2026-03-01",
    });
  });
  it("둘 다 없음(여러 게임 방송만) → specimen", () => {
    expect(cardMedia({ name: "이름", vods: [] })).toEqual({ kind: "specimen" });
    expect(cardMedia({ name: "이름", vods: [multi] })).toEqual({ kind: "specimen" });
  });
});

describe("cardMedia: 하이라이트(clip)", () => {
  const clipOf = (v: Vod, h: number): Vod => ({ ...v, highlightStart: h });
  const ID = "BBBBBBBBBBB";
  const hlVod = clipOf({ title: "다른 게임 하고 저챗", url: `https://youtu.be/${ID}`, date: "2026-04-01" }, 5025);
  it("clip + 포스터 → still poster", () => {
    expect(cardMedia({ name: "이름", posterUrl: POSTER, vods: [hlVod] })).toEqual({
      kind: "clip",
      videoId: ID,
      startSec: 5025,
      date: "2026-04-01",
      still: { kind: "poster", url: POSTER },
    });
  });
  it("clip + 사진 → still photo(사진은 namedYoutubeVod, 재생 영상 썸네일이 아니다)", () => {
    expect(cardMedia({ name: "이름", vods: [solo, hlVod] })).toEqual({
      kind: "clip",
      videoId: ID,
      startSec: 5025,
      date: "2026-04-01",
      still: { kind: "photo", url: "https://i.ytimg.com/vi/WAB1r0yczck/hqdefault.jpg", date: "2026-03-01" },
    });
  });
  it("clip + 표본 → still specimen, 0초도 clip", () => {
    expect(cardMedia({ name: "이름", vods: [clipOf(multi, 0)] })).toEqual({
      kind: "clip",
      videoId: "AAAAAAAAAAA",
      startSec: 0,
      date: "2026-02-01",
      still: { kind: "specimen" },
    });
  });
  it("stillMedia는 하이라이트를 보지 않는다", () => {
    expect(stillMedia({ name: "이름", vods: [hlVod] })).toEqual({ kind: "specimen" });
  });
  it("highlightEmbedUrl", () => {
    expect(highlightEmbedUrl(ID, 5025)).toBe(`https://www.youtube-nocookie.com/embed/${ID}?start=5025&autoplay=1&playsinline=1&rel=0`);
  });
});
