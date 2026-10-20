import { describe, expect, test } from "vitest";
import {
  clamp_widget_size,
  initial_widget_size,
  parse_widget,
  serialize_widget,
  widget_size_schema,
  WIDGET_FALLBACK_SIZE,
} from "./widget";

describe("widget files", () => {
  const file = { app: "clock", w: 2, h: 2 };

  test("a file without a style still parses, with none set (a card)", () => {
    expect(parse_widget(JSON.stringify(file))).toEqual(file);
  });

  test("a known style round-trips", () => {
    expect(parse_widget(serialize_widget({ ...file, style: "glass" }))).toEqual({ ...file, style: "glass" });
  });

  test("an unknown style falls back to none instead of breaking the file", () => {
    expect(parse_widget(JSON.stringify({ ...file, style: "neon" }))).toEqual(file);
    expect(parse_widget(JSON.stringify({ ...file, style: 3 }))).toEqual(file);
  });
});

const limits = { min: { w: 2, h: 1 }, max: { w: 4, h: 3 }, default: { w: 3, h: 1 } };

describe("widget sizes", () => {
  test("a stored size is clamped into the app's range on each axis", () => {
    expect(clamp_widget_size({ w: 8, h: 1 }, limits)).toEqual({ w: 4, h: 1 });
    expect(clamp_widget_size({ w: 1, h: 5 }, limits)).toEqual({ w: 2, h: 3 });
    expect(clamp_widget_size({ w: 7, h: 7 }, undefined)).toEqual({ w: 7, h: 7 });
  });

  test("a new widget takes the asked size clamped, else the app's default, else the fallback", () => {
    expect(initial_widget_size(limits, { w: 9, h: 2 })).toEqual({ w: 4, h: 2 });
    expect(initial_widget_size(limits)).toEqual({ w: 3, h: 1 });
    expect(initial_widget_size(undefined)).toEqual(WIDGET_FALLBACK_SIZE);
  });

  test("the manifest's range needs min ≤ default ≤ max and spans of 1–8", () => {
    expect(widget_size_schema.safeParse(limits).success).toBe(true);
    expect(widget_size_schema.safeParse({ ...limits, default: { w: 5, h: 1 } }).success).toBe(false);
    expect(widget_size_schema.safeParse({ ...limits, max: { w: 9, h: 3 } }).success).toBe(false);
  });
});
