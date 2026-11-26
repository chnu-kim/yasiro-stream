// /api/awards 엔드포인트(클라이언트). 호출·{status, body} 반환(status 0 = 네트워크 오류)은 src/lib/api-client.ts가 맡는다.
// 응답 해석·문구는 src/lib/awards/client.ts(순수 함수)가 맡는다.
import { callApi } from '@/lib/api-client';
import type { Division } from '@/lib/awards/types';

export const awardsApi = {
  draw: (division: Division, size: number, thirdPlace: boolean) => callApi('POST', '/api/awards/draw', { division, size, thirdPlace }),
  submit: (division: Division, token: string, picks: readonly string[]) =>
    callApi('POST', `/api/awards/submit?division=${encodeURIComponent(division)}`, { token, picks }),
};
