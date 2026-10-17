import { format_bytes } from "$lib/core/utils";
import type { ExifTags, ExifValue, GpsPosition, Metadata } from "$lib/core/utils/exif";

export const Group = {
  DOCUMENT: "Document",
  CAMERA: "Camera",
  CAPTURE: "Capture",
  GPS: "GPS",
  IMAGE: "Image",
  SOFTWARE: "Software",
  OTHER: "Other",
} as const;
export type Group = (typeof Group)[keyof typeof Group];

export interface Row {
  label: string;
  value: string;
  href?: string;
  offset?: number;
}

export interface RowGroup {
  title: Group;
  rows: Row[];
}

interface TagRule {
  group: Group;
  label: string;
  format?: (value: ExifValue, tags: ExifTags) => string | null;
}

const EXPOSURE_PROGRAM = ["Not defined", "Manual", "Normal", "Aperture priority", "Shutter priority", "Creative", "Action", "Portrait", "Landscape"];
const METERING = ["Unknown", "Average", "Centre-weighted", "Spot", "Multi-spot", "Pattern", "Partial"];
const EXPOSURE_MODE = ["Auto", "Manual", "Auto bracket"];
const SCENE = ["Standard", "Landscape", "Portrait", "Night"];
const ORIENTATION = ["", "Normal", "Mirrored", "Upside down", "Flipped", "Mirrored, turned left", "Turned right", "Mirrored, turned right", "Turned left"];
const PROGRAM_TAGS = new Set(["ExposureProgram", "MeteringMode", "ExposureMode", "SceneCaptureType", "WhiteBalance"]);

export function round(value: number, digits = 2): string {
  return String(Number(value.toFixed(digits)));
}

function first(value: ExifValue): number | null {
  const number = Array.isArray(value) ? value[0] : value;
  return typeof number === "number" ? number : null;
}

function pick(names: readonly string[]) {
  return (value: ExifValue) => {
    const index = first(value);
    return index === null ? null : (names[index] ?? String(index));
  };
}

const unit = (suffix: string, digits = 1) => (value: ExifValue) => {
  const number = first(value);
  return number === null ? null : `${round(number, digits)} ${suffix}`;
};

export function exposure(seconds: number): string {
  if (seconds <= 0) return "0 s";
  if (seconds >= 0.3) return `${round(seconds, 1)} s`;
  return `1/${Math.round(1 / seconds)} s`;
}

/** EXIF writes `2024:05:01 12:34:56`; this gives `2024-05-01 12:34:56`. */
export function exif_date(value: ExifValue | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
}

function lens(value: ExifValue): string | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const [short, long, wide, tele] = value;
  const focal = short === long ? `${round(short, 0)} mm` : `${round(short, 0)}–${round(long, 0)} mm`;
  if (!wide) return focal;
  return `${focal} f/${round(wide, 1)}${tele && tele !== wide ? `–${round(tele, 1)}` : ""}`;
}

const TAGS: Readonly<Record<string, TagRule>> = {
  Make: { group: Group.CAMERA, label: "Make" },
  Model: { group: Group.CAMERA, label: "Model" },
  BodySerialNumber: { group: Group.CAMERA, label: "Serial number" },
  CameraOwnerName: { group: Group.CAMERA, label: "Owner" },
  LensMake: { group: Group.CAMERA, label: "Lens make" },
  LensModel: { group: Group.CAMERA, label: "Lens" },
  LensSpecification: { group: Group.CAMERA, label: "Lens range", format: lens },
  LensSerialNumber: { group: Group.CAMERA, label: "Lens serial number" },

  DateTimeOriginal: { group: Group.CAPTURE, label: "Taken", format: (value) => exif_date(value) },
  OffsetTimeOriginal: { group: Group.CAPTURE, label: "Time zone" },
  DateTimeDigitized: { group: Group.CAPTURE, label: "Digitized", format: (value) => exif_date(value) },
  ExposureTime: { group: Group.CAPTURE, label: "Exposure", format: (value) => (first(value) === null ? null : exposure(first(value)!)) },
  FNumber: { group: Group.CAPTURE, label: "Aperture", format: (value) => (first(value) === null ? null : `f/${round(first(value)!, 1)}`) },
  ISO: { group: Group.CAPTURE, label: "ISO", format: (value) => (first(value) === null ? null : String(first(value))) },
  FocalLength: { group: Group.CAPTURE, label: "Focal length", format: unit("mm") },
  FocalLengthIn35mmFilm: { group: Group.CAPTURE, label: "35 mm equivalent", format: unit("mm", 0) },
  ExposureBiasValue: {
    group: Group.CAPTURE,
    label: "Exposure bias",
    format: (value) => {
      const number = first(value);
      return number === null ? null : `${number > 0 ? "+" : ""}${round(number, 1)} EV`;
    },
  },
  ExposureProgram: { group: Group.CAPTURE, label: "Program", format: pick(EXPOSURE_PROGRAM) },
  ExposureMode: { group: Group.CAPTURE, label: "Exposure mode", format: pick(EXPOSURE_MODE) },
  MeteringMode: { group: Group.CAPTURE, label: "Metering", format: pick(METERING) },
  Flash: {
    group: Group.CAPTURE,
    label: "Flash",
    format: (value) => {
      const number = first(value);
      return number === null ? null : number & 1 ? "Fired" : "Off";
    },
  },
  WhiteBalance: { group: Group.CAPTURE, label: "White balance", format: pick(["Auto", "Manual"]) },
  SceneCaptureType: { group: Group.CAPTURE, label: "Scene", format: pick(SCENE) },
  DigitalZoomRatio: { group: Group.CAPTURE, label: "Digital zoom", format: (value) => (first(value) ? `${round(first(value)!, 2)}×` : null) },
  SubjectDistance: { group: Group.CAPTURE, label: "Subject distance", format: unit("m", 2) },

  Software: { group: Group.SOFTWARE, label: "Software" },
  HostComputer: { group: Group.SOFTWARE, label: "Computer" },
  DateTime: { group: Group.SOFTWARE, label: "Modified", format: (value) => exif_date(value) },
  ExifVersion: { group: Group.SOFTWARE, label: "EXIF version" },

  Artist: { group: Group.OTHER, label: "Artist" },
  Copyright: { group: Group.OTHER, label: "Copyright" },
  ImageDescription: { group: Group.OTHER, label: "Description" },
  UserComment: { group: Group.OTHER, label: "Comment" },
  ImageUniqueID: { group: Group.OTHER, label: "Unique ID" },
};

const SHOWN_ELSEWHERE = new Set([
  "Orientation",
  "ColorSpace",
  "ImageWidth",
  "ImageLength",
  "PixelXDimension",
  "PixelYDimension",
  "XResolution",
  "YResolution",
  "ResolutionUnit",
  "YCbCrPositioning",
  "FlashpixVersion",
  "SensitivityType",
  "ShutterSpeedValue",
  "ApertureValue",
  "BrightnessValue",
  "MaxApertureValue",
  "SubSecTime",
  "SubSecTimeOriginal",
  "SubSecTimeDigitized",
  "OffsetTime",
  "OffsetTimeDigitized",
  "LightSource",
  "SensingMethod",
  "CustomRendered",
]);

function words(name: string): string {
  return name.replace(/^GPS/, "GPS ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function plain(value: ExifValue): string {
  return Array.isArray(value) ? value.map((item) => round(item, 4)).join(", ") : typeof value === "number" ? round(value, 4) : value;
}

export function coordinates(gps: GpsPosition): string {
  return `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`;
}

export function map_link(gps: GpsPosition): string {
  const [lat, lon] = [gps.latitude.toFixed(6), gps.longitude.toFixed(6)];
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
}

function gps_rows(metadata: Metadata): Row[] {
  const { gps, exif } = metadata;
  const rows: Row[] = [];
  if (gps) {
    rows.push({ label: "Position", value: coordinates(gps), href: map_link(gps) });
    if (gps.altitude !== null) rows.push({ label: "Altitude", value: `${round(gps.altitude, 1)} m` });
  }
  const time = Array.isArray(exif.GPSTimeStamp) ? exif.GPSTimeStamp.map((part) => String(Math.floor(part)).padStart(2, "0")).join(":") : null;
  const day = exif_date(exif.GPSDateStamp);
  if (day || time) rows.push({ label: "Time (UTC)", value: [day, time].filter(Boolean).join(" ") });
  if (typeof exif.GPSImgDirection === "number") rows.push({ label: "Direction", value: `${round(exif.GPSImgDirection, 0)}°` });
  if (typeof exif.GPSSpeed === "number") {
    const speed_unit = exif.GPSSpeedRef === "M" ? "mph" : exif.GPSSpeedRef === "N" ? "knots" : "km/h";
    rows.push({ label: "Speed", value: `${round(exif.GPSSpeed, 1)} ${speed_unit}` });
  }
  if (typeof exif.GPSHPositioningError === "number") rows.push({ label: "Accuracy", value: `± ${round(exif.GPSHPositioningError, 1)} m` });
  if (typeof exif.GPSMapDatum === "string") rows.push({ label: "Datum", value: exif.GPSMapDatum });
  return rows;
}

function image_rows(metadata: Metadata, size: number | null): Row[] {
  const rows: Row[] = [{ label: "Format", value: metadata.format?.toUpperCase() ?? "Unknown" }];
  if (metadata.width !== null && metadata.height !== null) {
    const turned = metadata.orientation >= 5;
    const [w, h] = turned ? [metadata.height, metadata.width] : [metadata.width, metadata.height];
    rows.push({ label: "Dimensions", value: `${w} × ${h}${turned ? ` (stored ${metadata.width} × ${metadata.height})` : ""}` });
  }
  if (metadata.orientation !== 1) rows.push({ label: "Orientation", value: `${ORIENTATION[metadata.orientation]} (${metadata.orientation})` });
  if (size !== null) rows.push({ label: "File size", value: format_bytes(size) });
  for (const [label, value] of Object.entries(metadata.details)) rows.push({ label, value: String(value) });
  if (metadata.exif.ColorSpace === 1 && !metadata.details["Colour space"]) rows.push({ label: "Colour space", value: "sRGB" });
  return rows;
}

export function image_groups(metadata: Metadata, size: number | null): RowGroup[] {
  const groups = new Map<Group, Row[]>(Object.values(Group).map((group) => [group, []]));
  groups.set(Group.IMAGE, image_rows(metadata, size));
  groups.set(Group.GPS, gps_rows(metadata));
  for (const [name, value] of Object.entries(metadata.exif)) {
    if (name.startsWith("GPS") || SHOWN_ELSEWHERE.has(name)) continue;
    const rule = TAGS[name];
    const shown = rule?.format ? rule.format(value, metadata.exif) : plain(value);
    if (shown === null || shown === "") continue;
    if (PROGRAM_TAGS.has(name) && shown === "Not defined") continue;
    groups.get(rule?.group ?? Group.OTHER)!.push({ label: rule?.label ?? words(name), value: shown });
  }
  const other = groups.get(Group.OTHER)!;
  for (const entry of metadata.text) other.push({ label: entry.key, value: entry.value });
  if (metadata.xmp !== null) other.push({ label: "XMP", value: `${format_bytes(new TextEncoder().encode(metadata.xmp).length)} packet` });
  for (const block of metadata.blocks) {
    other.push({ label: `Block ${block.kind.trim()}`, value: `${format_bytes(block.length)} at 0x${block.offset.toString(16)}`, offset: block.offset });
  }
  return [...groups].filter(([, rows]) => rows.length > 0).map(([title, rows]) => ({ title, rows }));
}

export function camera(tags: ExifTags): string | null {
  const make = typeof tags.Make === "string" ? tags.Make : "";
  const model = typeof tags.Model === "string" ? tags.Model : "";
  const brand = make.split(" ")[0].toLowerCase();
  const joined = brand && model.toLowerCase().startsWith(brand) ? model : [make, model].filter(Boolean).join(" ");
  return joined || null;
}

export function taken(metadata: Metadata): string | null {
  const modified = metadata.details.Modified;
  return exif_date(metadata.exif.DateTimeOriginal) ?? exif_date(metadata.exif.DateTime) ?? (typeof modified === "string" ? modified : null);
}
