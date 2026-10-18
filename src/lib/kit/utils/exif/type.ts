export const ImageKind = { JPEG: "jpeg", PNG: "png", WEBP: "webp" } as const;
export type ImageKind = (typeof ImageKind)[keyof typeof ImageKind];

/** A rational comes back as its quotient; several values of one tag as an array. */
export type ExifValue = string | number | number[];

export type ExifTags = Record<string, ExifValue>;

export interface GpsPosition {
  /** Decimal degrees; south, west and below sea level are negative. */
  latitude: number;
  longitude: number;
  altitude: number | null;
}

export interface TextEntry {
  key: string;
  value: string;
}

export interface MetadataBlock {
  kind: string;
  offset: number;
  length: number;
}

export interface Metadata {
  format: ImageKind | null;
  /** As stored, before orientation. */
  width: number | null;
  height: number | null;
  orientation: number;
  exif: ExifTags;
  gps: GpsPosition | null;
  text: TextEntry[];
  details: Record<string, string | number>;
  xmp: string | null;
  blocks: MetadataBlock[];
}
