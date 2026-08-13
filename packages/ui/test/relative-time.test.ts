import { describe, expect, test } from "bun:test";
import { formatRelativeTime } from "../src/lib/relative-time";

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-08-13T12:00:00.000Z");

  test("formats seconds, minutes, hours, and days", () => {
    expect(formatRelativeTime("2026-08-13T11:59:40.000Z", now)).toBe("20s");
    expect(formatRelativeTime("2026-08-13T11:52:00.000Z", now)).toBe("8m");
    expect(formatRelativeTime("2026-08-13T10:00:00.000Z", now)).toBe("2h");
    expect(formatRelativeTime("2026-08-10T12:00:00.000Z", now)).toBe("3d");
  });

  test("returns empty string for invalid timestamps", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("");
  });
});
