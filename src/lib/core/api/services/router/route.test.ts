import { describe, expect, test } from "vitest";
import { z } from "zod";
import { is_shareable, parse_hash, serialize_route } from "./route";

describe("parse_hash", () => {
  test("app without props", () => {
    expect(parse_hash("#/app/minesweeper")).toEqual({ kind: "app", id: "minesweeper", props: undefined });
  });

  test("values are JSON-parsed, falling back to the raw string", () => {
    expect(parse_hash("#/app/example?count=3&section=about&flag=true&list=%5B1%2C2%5D")).toEqual({
      kind: "app",
      id: "example",
      props: { count: 3, section: "about", flag: true, list: [1, 2] },
    });
  });

  test("anything that isn't an app link", () => {
    expect(parse_hash("")).toBeNull();
    expect(parse_hash("#top")).toBeNull();
    expect(parse_hash("#/file/home/a.txt")).toBeNull();
    expect(parse_hash("#/app/")).toBeNull();
    expect(parse_hash("#/app/a/b")).toBeNull();
    expect(parse_hash("#/app/%E0%A4%A")).toBeNull();
  });
});

describe("serialize_route", () => {
  test("round-trips through parse_hash", () => {
    const route = { kind: "app" as const, id: "settings", props: { section: "about", count: 2, nested: { a: [1] } } };
    expect(serialize_route(route)).toBe("#/app/settings?section=about&count=2&nested=%7B%22a%22%3A%5B1%5D%7D");
    expect(parse_hash(serialize_route(route))).toEqual(route);
  });

  test("no props, no query", () => {
    expect(serialize_route({ kind: "app", id: "snake", props: undefined })).toBe("#/app/snake");
    expect(serialize_route({ kind: "app", id: "snake", props: {} })).toBe("#/app/snake");
  });
});

describe("is_shareable", () => {
  test("apps whose props are an OPFS path aren't", () => {
    expect(is_shareable({ props: z.object({ path: z.string() }) })).toBe(false);
    expect(is_shareable({ props: z.object({ section: z.string() }) })).toBe(true);
    expect(is_shareable({ props: undefined })).toBe(true);
  });
});
