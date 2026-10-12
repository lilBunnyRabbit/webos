import { describe, expect, test } from "vitest";
import {
  clamp_int,
  find_position,
  positions_schema,
  remember_position,
  settings_schema,
  DEFAULT_SETTINGS,
} from "./storage";

describe("remember_position", () => {
  test("puts the latest file first and replaces its old entry", () => {
    const list = remember_position(
      [
        { path: "/a", index: 1 },
        { path: "/b", index: 2 },
      ],
      "/b",
      9
    );
    expect(list).toEqual([
      { path: "/b", index: 9 },
      { path: "/a", index: 1 },
    ]);
  });

  test("forgets the oldest past the cap", () => {
    let list = remember_position([], "/1", 1, 2);
    list = remember_position(list, "/2", 2, 2);
    list = remember_position(list, "/3", 3, 2);
    expect(list.map((entry) => entry.path)).toEqual(["/3", "/2"]);
  });

  test("finds a stored position", () => {
    const list = [{ path: "/a", index: 4 }];
    expect(find_position(list, "/a")).toBe(4);
    expect(find_position(list, "/b")).toBeNull();
  });
});

describe("schemas", () => {
  test("accept the defaults and reject out-of-range values", () => {
    expect(settings_schema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
    expect(settings_schema.safeParse({ ...DEFAULT_SETTINGS, wpm: 5 }).success).toBe(false);
    expect(positions_schema.safeParse([{ path: "/a", index: -1 }]).success).toBe(false);
  });
});

describe("clamp_int", () => {
  test("rounds and clamps, and treats junk as the minimum", () => {
    expect(clamp_int(12.6, 0, 10)).toBe(10);
    expect(clamp_int(4.4, 0, 10)).toBe(4);
    expect(clamp_int(Number.NaN, 50, 100)).toBe(50);
  });
});
