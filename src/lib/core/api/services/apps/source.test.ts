import { describe, expect, test } from "vitest";
import { manifest_url } from "./source";

describe("manifest_url", () => {
  test("the first load asks for the chunk itself, each retry for a fresh URL", () => {
    const entry = { manifest: "assets/paint.manifest-abc.js" };
    expect(manifest_url("/webos/", entry, 0)).toBe("/webos/assets/paint.manifest-abc.js");
    expect(manifest_url("/webos/", entry, 2)).toBe("/webos/assets/paint.manifest-abc.js?retry=2");
  });
});
