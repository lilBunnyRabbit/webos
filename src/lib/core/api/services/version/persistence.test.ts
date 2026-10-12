import { describe, expect, test } from "vitest";
import { parse_seen, serialize_seen } from "./persistence";

describe("version state", () => {
  test("round-trips", () => {
    expect(parse_seen(serialize_seen("0.8.2"))).toBe("0.8.2");
  });

  test("corrupt, unknown version or empty seen is a first boot", () => {
    expect(parse_seen("{")).toBeNull();
    expect(parse_seen(JSON.stringify({ version: 2, seen: "0.8.2" }))).toBeNull();
    expect(parse_seen(JSON.stringify({ version: 1, seen: "" }))).toBeNull();
  });
});
