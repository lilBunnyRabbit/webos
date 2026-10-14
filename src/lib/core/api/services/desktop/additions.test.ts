import { describe, expect, it } from "vitest";
import { parse_additions, pending_widgets, serialize_additions, type DefaultWidget } from "./additions";

const widget = (id: string): DefaultWidget => ({ id, app_id: id, label: id, size: { w: 2, h: 2 } });

describe("desktop additions", () => {
  it("round-trips, deduplicated and sorted", () => {
    expect(parse_additions(serialize_additions(["b", "a", "b"]))).toEqual(["a", "b"]);
  });
  it("treats missing or broken files as nothing applied", () => {
    expect(parse_additions(null)).toEqual([]);
    expect(parse_additions("{ nope")).toEqual([]);
    expect(parse_additions(JSON.stringify({ version: 2, applied: ["a"] }))).toEqual([]);
  });
  it("lists only defaults not placed yet", () => {
    expect(pending_widgets(["a"], [widget("a"), widget("b")]).map((item) => item.id)).toEqual(["b"]);
  });
});
