import { describe, expect, it } from "vitest";
import { formatTimecode, parseTimecode } from "./timecode.ts";

describe("parseTimecode", () => {
  const ok: [string, number][] = [
    ["45", 45],
    ["0", 0],
    ["00", 0],
    ["5025", 5025],
    ["86399", 86399],
    ["0:05", 5],
    ["83:20", 5000],
    ["1:23:45", 5025],
    ["01:02:03", 3723],
    ["23:59:59", 86399],
    ["1h23m45s", 5025],
    ["1H23M45S", 5025],
    ["90s", 90],
    ["2m", 120],
    ["1h", 3600],
    ["75m", 4500],
    ["0s", 0],
    [" 1:23:45 ", 5025],
    ["１：２３", 83],
  ];
  it.each(ok)("%j → %d", (raw, sec) => {
    expect(parseTimecode(raw)).toBe(sec);
  });

  const bad = [
    "86400",
    "24:00:00",
    "1440:00",
    "24h",
    "",
    "   ",
    "1:2",
    "1:60",
    "1:5:00",
    "1:00:60",
    "100:00:00",
    ":30",
    "30:",
    "1::2",
    "1:2:3:4",
    "1 : 20",
    "1.5",
    "-5",
    "+5",
    "1e3",
    "abc",
    "h",
    "1h 2m",
    "1s2m",
    "99999999999999999999",
    "99999999999999999999s",
  ];
  it.each(bad)("%j → null", (raw) => {
    expect(parseTimecode(raw)).toBeNull();
  });
});

describe("formatTimecode", () => {
  const cases: [number, string][] = [
    [0, "0:00"],
    [45, "0:45"],
    [600, "10:00"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [5025, "1:23:45"],
    [86399, "23:59:59"],
  ];
  it.each(cases)("%d → %s", (sec, text) => {
    expect(formatTimecode(sec)).toBe(text);
  });
  it("왕복: parseTimecode(formatTimecode(s)) === s", () => {
    for (const s of [0, 59, 60, 3599, 3600, 86399]) expect(parseTimecode(formatTimecode(s))).toBe(s);
  });
});
