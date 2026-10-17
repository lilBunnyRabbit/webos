import { describe, expect, test } from "vitest";
import { ImageFormat } from "$lib/core/utils/image-format";
import {
  is_image_name,
  joined_name,
  kept_format,
  patched_name,
  redacted_name,
  split_folder_name,
  tile_name,
  transparent_name,
  trimmed_name,
} from "./naming";

describe("output names", () => {
  test("keep the old apps' suffixes", () => {
    expect(transparent_name("logo.jpg", ".png")).toBe("logo-transparent.png");
    expect(trimmed_name("icon.webp", ".webp")).toBe("icon-cropped.webp");
    expect(joined_name(".png")).toBe("joined.png");
    expect(split_folder_name("photo.jpeg")).toBe("photo-split");
    expect(tile_name("photo.jpeg", 3)).toBe("photo_3.png");
    expect(patched_name("export.jpg")).toBe("export-patched.png");
    expect(redacted_name("scan.jpg", ".jpg")).toBe("scan-redacted.jpg");
  });

  test("kept_format keeps the source format and spelling", () => {
    expect(kept_format("a.JPEG", false)).toEqual({ format: ImageFormat.JPEG, extension: ".jpeg" });
    expect(kept_format("a.webp", true)).toEqual({ format: ImageFormat.WEBP, extension: ".webp" });
  });

  test("kept_format falls back to PNG for unknown formats and for JPEG when alpha matters", () => {
    expect(kept_format("a.gif", false)).toEqual({ format: ImageFormat.PNG, extension: ".png" });
    expect(kept_format("a.jpg", true)).toEqual({ format: ImageFormat.PNG, extension: ".png" });
  });

  test("is_image_name", () => {
    expect(is_image_name("a.PNG")).toBe(true);
    expect(is_image_name("a.pdf")).toBe(false);
  });
});
