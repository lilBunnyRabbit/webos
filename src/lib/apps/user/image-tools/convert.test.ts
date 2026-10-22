import { describe, expect, test } from "vitest";
import { converted_name, convert_warnings, formats_folder_name, formats_zip_name } from "./convert";

const photo = { size: 1_000_000, width: 4000, height: 3000, alpha: false };
const logo = { size: 50_000, width: 200, height: 200, alpha: true };

describe("convert_warnings", () => {
  test("a photo only warns where the format changes it", () => {
    expect(convert_warnings("jpeg", photo, 400_000)).toEqual([]);
    expect(convert_warnings("gif", photo, 900_000)).toEqual(["Cut to 256 colours"]);
    expect(convert_warnings("ico", photo, 90_000)).toEqual(["Shrunk to 256 px at most"]);
    expect(convert_warnings("bmp", photo, 36_000_000)).toEqual(["36× the original"]);
  });

  test("transparency lost or hardened", () => {
    expect(convert_warnings("jpeg", logo, 10_000)).toEqual(["Transparency flattened onto white"]);
    expect(convert_warnings("ppm", logo, 120_000)).toEqual(["Transparency flattened onto white"]);
    expect(convert_warnings("gif", logo, 20_000)).toEqual(["Transparency is on or off: soft edges turn hard", "Cut to 256 colours"]);
    expect(convert_warnings("png", logo, 40_000)).toEqual([]);
    expect(convert_warnings("ico", logo, 40_000)).toEqual([]);
  });

  test("no size yet, no size warning", () => {
    expect(convert_warnings("tiff", photo, null)).toEqual([]);
  });
});

describe("names", () => {
  test("stem plus the format's extension, folder and zip", () => {
    expect(converted_name("photo.png", "jpeg")).toBe("photo.jpg");
    expect(converted_name("photo.png", "tiff")).toBe("photo.tiff");
    expect(formats_folder_name("photo.png")).toBe("photo-formats");
    expect(formats_zip_name("photo.png")).toBe("photo-formats.zip");
  });
});
