// 요청 본문을 상한까지만 받아 JSON으로 읽는다. games·awards API가 함께 쓴다(도메인 전용이 아니다).
// 413·400 응답 모양은 두 API의 오류 응답과 같다: { error: { code, message } } + Cache-Control: no-store.

export type Body = { ok: true; value: unknown } | { ok: false; response: Response };

function fail(status: number, code: "payload_too_large" | "bad_json", message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

/** 스트림을 max바이트까지만 읽는다. 넘으면 그 자리에서 읽기를 취소하고 null */
async function readCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array | null> {
  if (body === null) return new Uint8Array(0);
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

/** 본문을 max바이트까지만 받아 JSON으로 읽는다. Content-Length가 없거나 거짓이어도 스트림을 max에서 끊는다.
 *  스트림 읽기 중 예외는 잡지 않는다(호출부의 500 처리로 간다). 잡는 것은 UTF-8·JSON 해석 실패(400)뿐이다 */
export async function readJsonBody(req: Request, max: number): Promise<Body> {
  const declared = Number(req.headers.get("content-length"));
  const tooLarge = fail(413, "payload_too_large", "요청이 너무 커요.");
  if (declared > max) return { ok: false, response: tooLarge };
  const bytes = await readCapped(req.body, max);
  if (bytes === null) return { ok: false, response: tooLarge };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false, response: fail(400, "bad_json", "요청 본문을 읽을 수 없어요.") };
  }
}
