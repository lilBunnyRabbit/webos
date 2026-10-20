import { describe, expect, test } from "vitest";
import { from_base45, to_base45 } from "./base45";

describe("base45", () => {
  test("matches the RFC 9285 examples", () => {
    expect(to_base45(new TextEncoder().encode("AB"))).toBe("BB8");
    expect(to_base45(new TextEncoder().encode("Hello!!"))).toBe("%69 VD92EX0");
    expect(new TextDecoder().decode(from_base45("QED8WEX0"))).toBe("ietf!");
  });

  test("rejects invalid input", () => {
    expect(() => from_base45("GGW")).toThrow();
    expect(() => from_base45("abc")).toThrow();
  });
});
