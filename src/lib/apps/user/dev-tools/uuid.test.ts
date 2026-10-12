import { describe, expect, test } from "vitest";
import { MAX_UUIDS, UuidVersion, generate_uuid, generate_uuids } from "./uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("generate_uuid", () => {
  test("v4 has the version and variant nibbles", () => {
    expect(generate_uuid(UuidVersion.V4)).toMatch(V4);
  });

  test("v7 has the version and variant nibbles and a current timestamp", () => {
    const before = Date.now();
    const id = generate_uuid(UuidVersion.V7);
    expect(id).toMatch(V7);
    const millis = parseInt(id.replace(/-/g, "").slice(0, 12), 16);
    expect(millis).toBeGreaterThanOrEqual(before);
    expect(millis).toBeLessThanOrEqual(Date.now());
  });

  test("v7 sorts in creation order", () => {
    const ids = generate_uuids(UuidVersion.V7, 50);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe("generate_uuids", () => {
  test("makes distinct ids", () => {
    expect(new Set(generate_uuids(UuidVersion.V4, 100)).size).toBe(100);
  });

  test("clamps the count", () => {
    expect(generate_uuids(UuidVersion.V4, 0)).toHaveLength(1);
    expect(generate_uuids(UuidVersion.V4, Number.NaN)).toHaveLength(1);
    expect(generate_uuids(UuidVersion.V4, 2.7)).toHaveLength(2);
    expect(generate_uuids(UuidVersion.V4, MAX_UUIDS + 5)).toHaveLength(MAX_UUIDS);
  });
});
