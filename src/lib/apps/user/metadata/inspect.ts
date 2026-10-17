import { read_metadata, type GpsPosition } from "$lib/core/utils/exif";
import { camera, image_groups, taken, type RowGroup } from "./groups";
import { strip_metadata } from "./strip";

export interface Inspection {
  format: string;
  groups: RowGroup[];
  camera: string | null;
  date: string | null;
  gps: GpsPosition | null;
  orientation: number;
  removable: number;
}

export function is_pdf_bytes(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

export async function inspect(bytes: Uint8Array, name: string): Promise<Inspection> {
  if (is_pdf_bytes(bytes)) return (await import("./pdf-info")).pdf_inspection(bytes, name);
  const metadata = read_metadata(bytes);
  if (!metadata.format) throw new Error(`“${name}” isn't a JPEG, PNG, WebP or PDF.`);
  return {
    format: metadata.format,
    groups: image_groups(metadata, bytes.length),
    camera: camera(metadata.exif),
    date: taken(metadata),
    gps: metadata.gps,
    orientation: metadata.orientation,
    removable: strip_metadata(bytes, { keep_orientation: false }).removed,
  };
}
