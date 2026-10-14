import { describe, expect, it } from "vitest";
import { summarize_props } from "./widget-props";

describe("summarize_props", () => {
  it("shows a dash without props", () => {
    expect(summarize_props(undefined)).toBe("—");
    expect(summarize_props({})).toBe("—");
    expect(summarize_props({ hidden: undefined })).toBe("—");
  });

  it("joins key: value pairs", () => {
    expect(summarize_props({ zone: "Europe/Ljubljana", seconds: true })).toBe("zone: Europe/Ljubljana · seconds: true");
  });

  it("cuts absolute paths to their last segment", () => {
    expect(summarize_props({ path: "/home/Documents/notes.md" })).toBe("path: notes.md");
  });

  it("truncates long strings", () => {
    expect(summarize_props({ title: "a".repeat(40) })).toBe(`title: ${"a".repeat(23)}…`);
  });

  it("counts arrays and objects", () => {
    expect(summarize_props({ list: [1, 2, 3], options: { a: 1 }, none: null })).toBe("list: [3] · options: {1} · none: null");
  });
});
