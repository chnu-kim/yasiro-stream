import { afterEach, describe, expect, it, vi } from "vitest";
import { callApi, type ApiFetch } from "./api-client.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callApi", () => {
  it("fetchImpl 없이 부르면 전역 fetch를 쓴다", async () => {
    const stub = vi.fn(async () => new Response('{"a":1}', { status: 200 }));
    vi.stubGlobal("fetch", stub);
    await expect(callApi("GET", "/api/x")).resolves.toEqual({ status: 200, body: { a: 1 } });
    expect(stub).toHaveBeenCalledWith("/api/x", { method: "GET", headers: undefined, body: undefined, credentials: "same-origin" });
  });

  it("payload가 없으면 헤더·본문 없이 same-origin 자격 증명으로 보낸다", async () => {
    const f = vi.fn<ApiFetch>(async () => new Response("{}", { status: 200 }));
    await callApi("GET", "/api/games/a/changes?limit=5", undefined, f);
    const init = f.mock.calls[0][1] as RequestInit;
    expect(f.mock.calls[0][0]).toBe("/api/games/a/changes?limit=5");
    expect(init).toEqual({ method: "GET", headers: undefined, body: undefined, credentials: "same-origin" });
    expect("body" in init && init.body === undefined).toBe(true);
  });

  it("payload가 있으면 JSON 본문과 Content-Type을 붙이고 상태·본문을 돌려준다", async () => {
    const f = vi.fn<ApiFetch>(async () => Response.json({ game: { id: "a" } }, { status: 201 }));
    await expect(callApi("POST", "/api/games", { input: { name: "가" } }, f)).resolves.toEqual({ status: 201, body: { game: { id: "a" } } });
    expect(f).toHaveBeenCalledWith("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"input":{"name":"가"}}',
      credentials: "same-origin",
    });
  });

  it("JSON 파싱이 실패하면 body는 null, status는 실제 값을 유지한다", async () => {
    const f: ApiFetch = async () => new Response("<html>bad gateway</html>", { status: 502 });
    await expect(callApi("GET", "/api/x", undefined, f)).resolves.toEqual({ status: 502, body: null });
    const empty: ApiFetch = async () => new Response(null, { status: 204 });
    await expect(callApi("POST", "/api/x", {}, empty)).resolves.toEqual({ status: 204, body: null });
  });

  it("fetch가 reject되면 status 0", async () => {
    const f: ApiFetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    await expect(callApi("POST", "/api/x", { a: 1 }, f)).resolves.toEqual({ status: 0, body: null });
  });
});
