import { describe, expect, it } from "vitest";
import { cardMedia } from "./media.ts";
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
