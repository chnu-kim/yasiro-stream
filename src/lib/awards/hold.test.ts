import { describe, expect, it } from "vitest";
import { ARM_MS, armed, HOLD_MS, isHoldKey } from "./hold.ts";

describe("hold", () => {
  it("시간 상수: 꾹 누르기 0.6초, 새 판 뒤 0.4초 잠금", () => {
    expect(HOLD_MS).toBe(600);
    expect(ARM_MS).toBe(400);
  });
  it("armed: 판이 뜬 뒤 ARM_MS가 지나야 true", () => {
    expect(armed(1000, 1000 + ARM_MS - 1)).toBe(false);
    expect(armed(1000, 1000 + ARM_MS)).toBe(true);
  });
  it("isHoldKey: Enter·Space의 첫 keydown만", () => {
    expect(isHoldKey("Enter", false)).toBe(true);
    expect(isHoldKey(" ", false)).toBe(true);
    expect(isHoldKey("Enter", true)).toBe(false);
    expect(isHoldKey("a", false)).toBe(false);
  });
});
