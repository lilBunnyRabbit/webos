import { describe, expect, it } from "vitest";
import { PreviewKind, image_type, preview_kind } from "./preview";

describe("preview_kind", () => {
  it("knows text and images by extension, case-insensitively", () => {
    expect(preview_kind("docs/README.md")).toBe(PreviewKind.TEXT);
    expect(preview_kind("LICENSE")).toBe(PreviewKind.TEXT);
    expect(preview_kind("a/Photo.JPG")).toBe(PreviewKind.IMAGE);
    expect(preview_kind("app.exe")).toBe(PreviewKind.NONE);
    expect(preview_kind("v1.2/archive")).toBe(PreviewKind.NONE);
  });

  it("gives image MIME types", () => {
    expect(image_type("x.svg")).toBe("image/svg+xml");
    expect(image_type("x.jpeg")).toBe("image/jpeg");
  });
});
