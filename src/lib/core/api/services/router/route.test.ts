import { describe, expect, test } from "vitest";
import { z } from "zod";
import { parse_hash, serialize_route, shareable_props } from "./route";

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

  test("solo link", () => {
    expect(parse_hash("#/solo/forms?f=v1abc")).toEqual({ kind: "solo", id: "forms", props: { f: "v1abc" } });
    expect(parse_hash("#/solo/")).toBeNull();
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

  test("solo round-trips", () => {
    const route = { kind: "solo" as const, id: "forms", props: { f: "v1abc" } };
    expect(serialize_route(route)).toBe("#/solo/forms?f=v1abc");
    expect(parse_hash(serialize_route(route))).toEqual(route);
  });

  test("no props, no query", () => {
    expect(serialize_route({ kind: "app", id: "snake", props: undefined })).toBe("#/app/snake");
    expect(serialize_route({ kind: "app", id: "snake", props: {} })).toBe("#/app/snake");
  });
});

describe("shareable_props", () => {
  test("leaves out device paths and keeps the rest", () => {
    expect(shareable_props({ path: "/home/a.pdf", section: "sign" })).toEqual({ props: { section: "sign" }, dropped: true });
    expect(shareable_props({ paths: ["/home/a", "/home/b"], left: "/x", right: "/y" })).toEqual({ props: undefined, dropped: true });
    expect(shareable_props({ cover: "/home/c.png" })).toEqual({ props: undefined, dropped: true });
    expect(shareable_props({ section: "about", count: 3 })).toEqual({ props: { section: "about", count: 3 }, dropped: false });
    expect(shareable_props(undefined)).toEqual({ props: undefined, dropped: false });
  });
});
