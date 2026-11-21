// /api/awards 호출 래퍼(클라이언트). 던지지 않고 {status, body}를 돌려준다(status 0 = 네트워크 오류).
// 응답 해석·문구는 src/lib/awards/client.ts(순수 함수)가 맡는다.
import type { Division } from '@/lib/awards/types';

export interface ApiResult {
  status: number;
  body: unknown;
}

async function call(method: string, url: string, payload?: unknown): Promise<ApiResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      credentials: 'same-origin',
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

export const awardsApi = {
  draw: (division: Division, size: number, thirdPlace: boolean) => call('POST', '/api/awards/draw', { division, size, thirdPlace }),
  submit: (division: Division, token: string, picks: readonly string[]) =>
    call('POST', `/api/awards/submit?division=${encodeURIComponent(division)}`, { token, picks }),
  rankings: (division: Division) => call('GET', `/api/awards/rankings?division=${encodeURIComponent(division)}`),
};
