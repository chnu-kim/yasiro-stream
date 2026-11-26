// 사이트 API 호출(클라이언트). 던지지 않고 {status, body}를 돌려준다(status 0 = 네트워크 오류).
// 엔드포인트 객체(src/app/games/adminApi.ts, src/app/awards/awardsApi.ts)가 함께 쓴다. 응답 해석·문구는 각 lib의 client.ts가 맡는다.

export interface ApiResult {
  status: number;
  /** JSON 본문. 본문이 없거나 JSON이 아니면 null(status는 실제 값 그대로) */
  body: unknown;
}

export type ApiFetch = (input: string, init?: RequestInit) => Promise<Response>;

// 네이티브 fetch를 그대로 넘기면 this가 풀려 Illegal invocation이 나므로 감싼다
const defaultFetch: ApiFetch = (input, init) => fetch(input, init);

export async function callApi(method: string, url: string, payload?: unknown, fetchImpl: ApiFetch = defaultFetch): Promise<ApiResult> {
  try {
    const res = await fetchImpl(url, {
      method,
      headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      credentials: "same-origin",
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
