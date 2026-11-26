import { describe, expect, it } from "vitest";
import { readJsonBody } from "./json-body.ts";

const URL_ = "https://yasiro.stream/api/x";
const MAX = 32;

const TOO_LARGE = '{"error":{"code":"payload_too_large","message":"요청이 너무 커요."}}';
const BAD_JSON = '{"error":{"code":"bad_json","message":"요청 본문을 읽을 수 없어요."}}';

function post(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request(URL_, { method: "POST", body, headers });
}

function streamRequest(stream: ReadableStream<Uint8Array>, headers: Record<string, string> = {}): Request {
  return new Request(URL_, { method: "POST", body: stream, headers, duplex: "half" } as RequestInit);
}

/** 응답 전체(상태·헤더 집합·본문 바이트)를 고정하려고 펼친다 */
async function snapshot(res: Response) {
  return { status: res.status, headers: [...res.headers.entries()].sort(), body: await res.text() };
}

const ERROR_HEADERS = [
  ["cache-control", "no-store"],
  ["content-type", "application/json"],
];

async function failure(req: Request, max = MAX) {
  const out = await readJsonBody(req, max);
  if (out.ok) throw new Error("통과하면 안 된다");
  return snapshot(out.response);
}

/** 본문이 정확히 n바이트인 JSON 문자열 */
function jsonOfBytes(n: number): string {
  const head = '{"p":"';
  return head + "a".repeat(n - head.length - 2) + '"}';
}

describe("readJsonBody", () => {
  it("JSON 본문을 읽는다", async () => {
    expect(await readJsonBody(post('{"a":[1,"가"]}'), MAX)).toEqual({ ok: true, value: { a: [1, "가"] } });
  });

  it("정확히 max바이트는 통과하고, max+1바이트는 Content-Length가 없어도 413", async () => {
    const exact = jsonOfBytes(MAX);
    expect(new TextEncoder().encode(exact).byteLength).toBe(MAX);
    expect(await readJsonBody(post(exact), MAX)).toEqual({ ok: true, value: { p: "a".repeat(MAX - 8) } });

    const over = new TextEncoder().encode(jsonOfBytes(MAX + 1));
    const req = post(over);
    expect(req.headers.get("content-length")).toBeNull();
    expect(await failure(req)).toEqual({ status: 413, headers: ERROR_HEADERS, body: TOO_LARGE });
  });

  it("Content-Length가 max를 넘으면 본문을 읽지 않고 413", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        pulled += 1;
        ctrl.enqueue(new Uint8Array([0x7b]));
        ctrl.close();
      },
    });
    expect(await failure(streamRequest(stream, { "content-length": String(MAX + 1) }))).toEqual({
      status: 413,
      headers: ERROR_HEADERS,
      body: TOO_LARGE,
    });
    expect(pulled).toBeLessThanOrEqual(1); // 스트림은 시작 때 한 번 당겨질 수 있지만 읽지 않는다
  });

  it("Content-Length가 정확히 max면 거르지 않는다(거짓이어도 실제 바이트로 다시 본다)", async () => {
    expect(await readJsonBody(post(jsonOfBytes(MAX), { "content-length": String(MAX) }), MAX)).toMatchObject({ ok: true });
  });

  it("스트림이 max를 넘는 순간 읽기를 취소하고 413", async () => {
    let pulled = 0;
    let cancelled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        pulled += 1;
        if (pulled > 100) ctrl.close();
        else ctrl.enqueue(new Uint8Array(10).fill(0x61));
      },
      cancel() {
        cancelled += 1;
      },
    });
    expect(await failure(streamRequest(stream))).toEqual({ status: 413, headers: ERROR_HEADERS, body: TOO_LARGE });
    expect(cancelled).toBe(1);
    expect(pulled).toBeLessThan(10);
  });

  it("여러 조각으로 온 본문을 이어 붙인다", async () => {
    const enc = new TextEncoder();
    const parts = ['{"a":', '"가', '나"}'].map((s) => enc.encode(s));
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        const next = parts.shift();
        if (next === undefined) ctrl.close();
        else ctrl.enqueue(next);
      },
    });
    expect(await readJsonBody(streamRequest(stream), MAX)).toEqual({ ok: true, value: { a: "가나" } });
  });

  it("본문이 없으면(body null) 400 bad_json", async () => {
    const req = post(null);
    expect(req.body).toBeNull();
    expect(await failure(req)).toEqual({ status: 400, headers: ERROR_HEADERS, body: BAD_JSON });
  });

  it("JSON이 아니면 400 bad_json", async () => {
    expect(await failure(post("{"))).toEqual({ status: 400, headers: ERROR_HEADERS, body: BAD_JSON });
  });

  it("잘못된 UTF-8 바이트는 대체 문자로 넘기지 않고 400 bad_json", async () => {
    const enc = new TextEncoder();
    const raw = new Uint8Array([...enc.encode('{"a":"'), 0xff, 0xfe, ...enc.encode('"}')]);
    expect(await failure(post(raw))).toEqual({ status: 400, headers: ERROR_HEADERS, body: BAD_JSON });
  });

  it("스트림 읽기 중 예외는 400으로 삼키지 않고 그대로 던진다(바깥 guarded가 500으로 바꾼다)", async () => {
    const boom = new TypeError("stream broke");
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        ctrl.error(boom);
      },
    });
    await expect(readJsonBody(streamRequest(stream), MAX)).rejects.toBe(boom);
  });
});
