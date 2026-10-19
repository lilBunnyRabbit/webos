import { describe, expect, test } from "vitest";
import type { History } from "./data";
import { last_trip, record_trip, suggestions } from "./suggest";

const history: History = {
  mleko: { count: 9, last: 300 },
  "mlet poper": { count: 1, last: 100 },
  "kokosovo mleko": { count: 4, last: 200 },
  kruh: { count: 7, last: 300 },
  jajca: { count: 2, last: 300 },
  sir: { count: 5, last: 100 },
};

describe("suggestions", () => {
  test("names starting with the text come first, then the most bought", () => {
    expect(suggestions(history, "ml", new Set())).toEqual(["mleko", "mlet poper", "kokosovo mleko"]);
    expect(suggestions(history, "mleko", new Set())).toEqual(["kokosovo mleko"]);
    expect(suggestions(history, "", new Set(), 3)).toEqual(["mleko", "kruh", "sir"]);
  });

  test("leaves out what's already on the list, and ignores case", () => {
    expect(suggestions(history, "ML", new Set(["mleko"]))).toEqual(["mlet poper", "kokosovo mleko"]);
  });
});

describe("last_trip", () => {
  test("is everything bought at the latest Clear done, not on the list again", () => {
    expect(last_trip(history, new Set())).toEqual(["mleko", "kruh", "jajca"]);
    expect(last_trip(history, new Set(["kruh"]))).toEqual(["mleko", "jajca"]);
    expect(last_trip({}, new Set())).toEqual([]);
  });
});

describe("record_trip", () => {
  test("counts each item once and stamps the trip", () => {
    const next = record_trip(history, ["Mleko", "mleko", "banane"], 400);
    expect(next.mleko).toEqual({ count: 10, last: 400 });
    expect(next.banane).toEqual({ count: 1, last: 400 });
    expect(history.mleko.count).toBe(9);
    expect(last_trip(next, new Set())).toEqual(["mleko", "banane"]);
  });
});
