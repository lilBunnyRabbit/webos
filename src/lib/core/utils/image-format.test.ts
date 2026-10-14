import { describe, expect, it } from "vitest";
import { ImageFormat, extension_for, format_for_name, format_of, has_quality, needs_backdrop } from "./image-format";

describe("format_of", () => {
  it("reads writable formats from the extension, case-insensitive", () => {
    expect(format_of("a.JPG")).toBe(ImageFormat.JPEG);
    expect(format_of("a.jpeg")).toBe(ImageFormat.JPEG);
    expect(format_of("/home/Pictures/a.webp")).toBe(ImageFormat.WEBP);
    expect(format_of("a.png")).toBe(ImageFormat.PNG);
  });

  it("is null for formats the browser can't encode and names without an extension", () => {
    expect(format_of("a.gif")).toBeNull();
    expect(format_of("png")).toBeNull();
    expect(format_of(".png")).toBeNull();
    expect(format_of("/home/my.pictures/cat")).toBeNull();
  });
});

describe("format_for_name", () => {
  it("lets the extension win over the fallback", () => {
    expect(format_for_name("x.webp", ImageFormat.PNG)).toBe(ImageFormat.WEBP);
    expect(format_for_name("x.bmp", ImageFormat.JPEG)).toBe(ImageFormat.JPEG);
    expect(format_for_name("x")).toBe(ImageFormat.PNG);
  });
});

describe("format traits", () => {
  it("maps formats back to their canonical extension", () => {
    expect(extension_for(ImageFormat.PNG)).toBe(".png");
    expect(extension_for(ImageFormat.JPEG)).toBe(".jpg");
    expect(extension_for(ImageFormat.WEBP)).toBe(".webp");
  });

  it("knows which formats are lossy and which lack alpha", () => {
    expect(has_quality(ImageFormat.PNG)).toBe(false);
    expect(has_quality(ImageFormat.WEBP)).toBe(true);
    expect(needs_backdrop(ImageFormat.JPEG)).toBe(true);
    expect(needs_backdrop(ImageFormat.WEBP)).toBe(false);
  });
});
