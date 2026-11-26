import { describe, expect, it } from "vitest";
import { isRecord } from "./json.ts";

describe("isRecord", () => {
  it("객체만 통과한다", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });
  it("null과 배열은 거른다", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
  });
  it("원시값은 거른다", () => {
    for (const v of ["a", 1, true, undefined]) expect(isRecord(v)).toBe(false);
  });
});
