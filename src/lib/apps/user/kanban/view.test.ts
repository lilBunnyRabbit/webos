import { describe, expect, test } from "vitest";
import { describe_due } from "./view";

describe("describe_due", () => {
  test("near days by name", () => {
    expect(describe_due("2026-10-14", "2026-10-14")).toBe("Today");
    expect(describe_due("2026-10-15", "2026-10-14")).toBe("Tomorrow");
    expect(describe_due("2026-10-13", "2026-10-14")).toBe("Yesterday");
    expect(describe_due("2026-10-11", "2026-10-14")).toBe("3 days ago");
  });

  test("far days by date, with the year only when it differs", () => {
    expect(describe_due("2026-10-30", "2026-10-14")).not.toMatch(/2026/);
    expect(describe_due("2027-01-02", "2026-10-14")).toMatch(/2027/);
  });
});
