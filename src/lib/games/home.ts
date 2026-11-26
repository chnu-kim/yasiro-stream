// 홈(/) "최근 탐험": 썸네일 대표 칸 1개 + 글자 기록 줄. 마지막 플레이 최신순(/games 최근 플레이순과 같은 순서)이고
// /games와 같은 번호(indexGames, 첫 플레이 순서)를 쓴다. 썸네일은 제목이 그 게임 하나만 가리키는 다시보기에서만 가져온다(media.ts namedYoutubeVod).
import { countStats, indexGames, sortGames } from "./query.ts";
import { lastPlayedOf } from "./played.ts";
import { lastYoutubeVod, namedYoutubeVod, youtubeThumbnailUrl } from "./media.ts";
import type { Game, GameStatus } from "./types.ts";

export interface Expedition {
  id: string;
  name: string;
  /** /games 카드와 같은 탐험 번호 ("368") */
  no: string;
  /** 마지막 플레이 날짜(lastPlayedOf) */
  date: string;
  status: GameStatus;
  videoId: string;
  vodUrl: string;
  vodTitle: string;
}

/** 대표 칸. 영상(videoId·vodUrl·vodTitle)은 썸네일과 같은, 이 게임 하나만 가리키는 가장 최근 다시보기 */
export interface FeaturedExpedition extends Expedition {
  thumbnailUrl: string;
}

export interface HomeData {
  total: number;
  clear: number;
  /** 후보 중 namedYoutubeVod(latest)가 있는 가장 최근 게임. 없으면 null(홈은 섹션을 숨긴다) */
  featured: FeaturedExpedition | null;
  /** 대표 칸을 뺀 후보를 최근 플레이순으로. 대표 칸과 합쳐 limit개 */
  rows: Expedition[];
}

/**
 * 후보: 마지막 플레이 최신순으로 날짜와 유튜브 다시보기가 있는 게임. 글자 줄은 그 게임의 가장 최근 유튜브 영상으로 잇는다.
 * 한 방송에서 여러 게임을 했으면 그 영상이 같으므로 목록 앞의 게임 하나만 남긴다.
 * 대표 칸은 후보 중 이 게임 하나만 가리키는 영상이 있는 가장 최근 게임이고 그중 가장 최근 영상을 쓴다. 그래서 그보다 최근 게임이 글자 줄로 먼저 올 수 있다.
 */
export function buildHomeData(games: readonly Game[], limit: number): HomeData {
  const stats = countStats(games);
  const candidates = sortGames(indexGames(games), "played").filter((game) => lastPlayedOf(game) !== null);

  const seen = new Set<string>();
  let featured: FeaturedExpedition | null = null;
  const rows: Expedition[] = [];
  for (const game of candidates) {
    // 대표 칸을 찾을 때까지는 limit을 넘어서도 더 오래된 게임을 본다
    if (featured !== null && rows.length >= limit - 1) break;
    const last = lastYoutubeVod(game);
    if (last === null || seen.has(last.videoId)) continue;
    seen.add(last.videoId);
    const base = { id: game.id, name: game.name, no: game.no, date: lastPlayedOf(game) as string, status: game.status };
    const named: ReturnType<typeof namedYoutubeVod> = featured === null ? namedYoutubeVod(game, { latest: true }) : null;
    if (named !== null) {
      featured = {
        ...base,
        videoId: named.videoId,
        vodUrl: named.vod.url,
        vodTitle: named.vod.title,
        thumbnailUrl: youtubeThumbnailUrl(named.videoId),
      };
    } else {
      rows.push({ ...base, videoId: last.videoId, vodUrl: last.vod.url, vodTitle: last.vod.title });
    }
  }
  // 대표 칸이 끝내 없으면 글자 줄만 limit개, 있으면 최근 줄부터 limit-1개
  return { total: stats.total, clear: stats.clear, featured, rows: rows.slice(0, featured === null ? limit : limit - 1) };
}
