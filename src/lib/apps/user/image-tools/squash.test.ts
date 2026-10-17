import { describe, expect, test } from "vitest";
import { squashed_name } from "./naming";
import { estimate_bytes, format_share, saved_share, squashed_size } from "./squash";

describe("squashed_size", () => {
  test("keeps the size without a max, or when it already fits", () => {
    expect(squashed_size({ width: 4000, height: 3000 }, null)).toEqual({ width: 4000, height: 3000 });
    expect(squashed_size({ width: 800, height: 600 }, 1024)).toEqual({ width: 800, height: 600 });
  });

  test("brings the longest side down to max, keeping the ratio", () => {
    expect(squashed_size({ width: 4000, height: 3000 }, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(squashed_size({ width: 1000, height: 3000 }, 300)).toEqual({ width: 100, height: 300 });
  });
});

describe("estimates and savings", () => {
  test("scales a sample's bytes by pixel count", () => {
    expect(estimate_bytes(1000, { width: 100, height: 100 }, { width: 200, height: 200 })).toBe(4000);
  });

  test("share saved, signed", () => {
    expect(saved_share(1000, 250)).toBe(0.75);
    expect(saved_share(0, 10)).toBe(0);
    expect(format_share(0.75)).toBe("−75%");
    expect(format_share(-0.2)).toBe("+20%");
    expect(format_share(0.001)).toBe("0%");
  });

  test("names copies with a suffix and the new extension", () => {
    expect(squashed_name("photo.jpg", ".webp")).toBe("photo-squashed.webp");
  });
});
