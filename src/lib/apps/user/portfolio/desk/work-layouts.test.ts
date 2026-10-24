import { describe, expect, it } from "vitest";
import { JOBS } from "../content/experience";
import { month_of, span_of, years_of } from "./work-layouts";

describe("work layouts", () => {
  it("reads a month and Present", () => {
    expect(month_of("Oct 2026")).toBe(2026 * 12 + 9);
    expect(month_of("Present", new Date(2026, 9, 23))).toBe(2026 * 12 + 9);
    expect(month_of("2026")).toBeNull();
  });

  it("spans a period with any dash", () => {
    expect(span_of("Jan 2025 – Oct 2026")).toEqual({ start: 2025 * 12, end: 2026 * 12 + 9 });
    expect(span_of("Nov 2019 - Jan 2025")).toEqual({ start: 2019 * 12 + 10, end: 2025 * 12 });
    expect(span_of("Oct 2026 – Jan 2025")).toBeNull();
  });

  it("gives every job a chapter's years", () => {
    expect(years_of("Jan 2025 – Oct 2026")).toEqual({ from: 2025, to: 2026 });
    expect(years_of("Nov 2019 – Jan 2025")).toEqual({ from: 2019, to: 2025 });
    for (const job of JOBS) expect(years_of(job.period), job.company).not.toBeNull();
  });
});
