import { describe, expect, it } from "vitest";
import { Mode, detect_mode } from "./mode";

describe("detect_mode", () => {
  it("is solo for a solo link", () => {
    expect(detect_mode("#/solo/forms?f=v1abc")).toBe(Mode.SOLO);
  });

  it("is full for an app link or no hash", () => {
    expect(detect_mode("#/app/forms")).toBe(Mode.FULL);
    expect(detect_mode("")).toBe(Mode.FULL);
  });
});
