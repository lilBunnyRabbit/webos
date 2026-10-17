import { describe, expect, it } from "vitest";
import { read_metadata } from "$lib/core/utils/exif";
import { jpeg, tiff } from "$lib/core/utils/exif/fixtures";
import { camera, exif_date, exposure, image_groups, map_link, taken } from "./groups";

const photo = read_metadata(
  jpeg({
    width: 4000,
    height: 3000,
    comment: "hi",
    exif: tiff(
      [
        { tag: 0x010f, type: 2, values: "Canon" },
        { tag: 0x0110, type: 2, values: "Canon EOS R6" },
        { tag: 0x0112, type: 3, values: [6] },
        { tag: 0x0131, type: 2, values: "Lightroom" },
        { tag: 0x8298, type: 2, values: "Me" },
      ],
      [
        { tag: 0x829a, type: 5, values: [0.004] },
        { tag: 0x829d, type: 5, values: [2.8] },
        { tag: 0x8822, type: 3, values: [0] },
        { tag: 0x9003, type: 2, values: "2024:05:01 12:34:56" },
        { tag: 0x9209, type: 3, values: [16] },
        { tag: 0xa432, type: 5, values: [24, 70, 2.8, 2.8] },
      ],
      [
        { tag: 0x01, type: 2, values: "N" },
        { tag: 0x02, type: 5, values: [46, 3, 0] },
        { tag: 0x03, type: 2, values: "E" },
        { tag: 0x04, type: 5, values: [14, 30, 0] },
        { tag: 0x06, type: 5, values: [295] },
      ]
    ),
  })
);

describe("image_groups", () => {
  const groups = image_groups(photo, 12345);
  const rows = (title: string) => Object.fromEntries(groups.find((group) => group.title === title)?.rows.map((row) => [row.label, row.value]) ?? []);

  it("orders groups and leaves empty ones out", () => {
    expect(groups.map((group) => group.title)).toEqual(["Camera", "Capture", "GPS", "Image", "Software", "Other"]);
  });

  it("formats camera and capture values", () => {
    expect(rows("Camera")).toEqual({ Make: "Canon", Model: "Canon EOS R6", "Lens range": "24–70 mm f/2.8" });
    expect(rows("Capture")).toEqual({ Taken: "2024-05-01 12:34:56", Exposure: "1/250 s", Aperture: "f/2.8", Flash: "Off" });
  });

  it("links GPS to a map and turns dimensions with the orientation", () => {
    const gps = groups.find((group) => group.title === "GPS")!.rows[0];
    expect(gps.value).toBe("46.050000, 14.500000");
    expect(gps.href).toBe("https://www.openstreetmap.org/?mlat=46.050000&mlon=14.500000#map=16/46.050000/14.500000");
    expect(rows("GPS").Altitude).toBe("295 m");
    expect(rows("Image")).toMatchObject({ Format: "JPEG", Dimensions: "3000 × 4000 (stored 4000 × 3000)", Orientation: "Turned right (6)" });
  });

  it("puts text, authorship and blocks in Other, blocks with their offset", () => {
    const other = groups.find((group) => group.title === "Other")!.rows;
    expect(other.map((row) => row.label)).toEqual(["Copyright", "Comment", "Block APP1 EXIF", "Block COM"]);
    expect(other[2].offset).toBe(20);
  });
});

describe("helpers", () => {
  it("formats exposures and EXIF dates", () => {
    expect(exposure(1 / 8000)).toBe("1/8000 s");
    expect(exposure(2.5)).toBe("2.5 s");
    expect(exif_date("2024:05:01 12:34:56")).toBe("2024-05-01 12:34:56");
    expect(exif_date("   ")).toBeNull();
  });

  it("names the camera once when the model repeats the make", () => {
    expect(camera({ Make: "Canon", Model: "Canon EOS R6" })).toBe("Canon EOS R6");
    expect(camera({ Make: "NIKON CORPORATION", Model: "NIKON Z 6" })).toBe("NIKON Z 6");
    expect(camera({ Make: "Apple", Model: "iPhone 15" })).toBe("Apple iPhone 15");
    expect(camera({})).toBeNull();
  });

  it("dates a file by capture, then modification", () => {
    expect(taken(photo)).toBe("2024-05-01 12:34:56");
    expect(map_link({ latitude: -1, longitude: 2, altitude: null })).toContain("mlat=-1.000000&mlon=2.000000");
  });
});
