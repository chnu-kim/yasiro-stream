// 관리자 API 엔드포인트(클라이언트). 호출·{status, body} 반환(status 0 = 네트워크 오류)은 src/lib/api-client.ts가 맡는다.
// 응답 해석·문구는 src/lib/games/client.ts(순수 함수)가 맡는다.
import { callApi } from '@/lib/api-client';
import type { CreateGameRequest, GameInput, GamePatch, SetHiddenRequest, UpdateGameRequest } from '@/lib/games/types';

const gameUrl = (id: string) => `/api/games/${encodeURIComponent(id)}`;

export const adminApi = {
  create: (input: GameInput) => callApi('POST', '/api/games', { input } satisfies CreateGameRequest),
  update: (id: string, expectedVersion: number, patch: GamePatch) =>
    callApi('PATCH', gameUrl(id), { expectedVersion, patch } satisfies UpdateGameRequest),
  setHidden: (id: string, hidden: boolean) => callApi('POST', `${gameUrl(id)}/hidden`, { hidden } satisfies SetHiddenRequest),
  changes: (id: string, limit: number) => callApi('GET', `${gameUrl(id)}/changes?limit=${limit}`),
  categories: (q: string) => callApi('GET', `/api/games/categories?q=${encodeURIComponent(q)}`),
  youtube: (url: string) => callApi('GET', `/api/games/youtube?url=${encodeURIComponent(url)}`),
};
