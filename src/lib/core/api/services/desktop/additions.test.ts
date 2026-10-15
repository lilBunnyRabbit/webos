import { describe, expect, it } from "vitest";
import type { AppManifest } from "$lib/core/api";
import { default_widgets, parse_additions, pending_widgets, serialize_additions, type DefaultWidget } from "./additions";

const widget = (id: string): DefaultWidget => ({ id, app_id: id, label: id });

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
  it("takes every app flagged default_widget that has a widget", () => {
    const app = (name: string, extra: Partial<AppManifest>) => [name, { name, ...extra } as AppManifest] as [string, AppManifest];
    const widget = async () => ({ default: (() => {}) as never });
    const apps = [app("a", { default_widget: true, widget }), app("b", { widget }), app("c", { default_widget: true })];
    expect(default_widgets(apps)).toEqual([{ id: "a", app_id: "a", label: "a" }]);
  });
});
