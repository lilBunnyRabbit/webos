import { split_collection } from "./font-collection";

export interface FaceStyle {
  weight: number;
  /** A variable font's `wght` axis, so one face covers every weight CSS asks for. */
  weights: [number, number] | null;
  italic: boolean;
}

function weight_axis(view: DataView, offset: number, length: number): [number, number] | null {
  if (length < 16) return null;
  const axes = offset + view.getUint16(offset + 4);
  const count = view.getUint16(offset + 8);
  const size = view.getUint16(offset + 10);
  for (let index = 0; index < count; index++) {
    const axis = axes + index * size;
    if (axis + 20 > offset + length) return null;
    if (view.getUint32(axis) === 0x77676874) return [view.getInt32(axis + 4) / 65536, view.getInt32(axis + 12) / 65536];
  }
  return null;
}

/** Weight and italic of a TrueType or OpenType font, from `OS/2` and `head`; `null` for WOFF, WOFF2 or anything unreadable. */
export function sfnt_style(bytes: Uint8Array): FaceStyle | null {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0);
  if (version !== 0x00010000 && version !== 0x74727565 && version !== 0x4f54544f) return null;
  let weight = 400;
  let weights: [number, number] | null = null;
  let italic = false;
  for (let index = 0; index < view.getUint16(4); index++) {
    const record = 12 + index * 16;
    if (record + 16 > bytes.length) return null;
    const tag = view.getUint32(record);
    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    if (offset + length > bytes.length) continue;
    if (tag === 0x4f532f32 && length >= 64) {
      weight = view.getUint16(offset + 4) || 400;
      italic ||= (view.getUint16(offset + 62) & 1) === 1;
    } else if (tag === 0x68656164 && length >= 46) {
      italic ||= (view.getUint16(offset + 44) & 2) === 2;
    } else if (tag === 0x66766172) {
      weights = weight_axis(view, offset, length);
    }
  }
  return { weight: Math.min(1000, Math.max(1, weight)), weights, italic };
}

export interface FaceSource {
  bytes: Uint8Array<ArrayBuffer>;
  /** Read from the font's own tables when left out. */
  descriptors?: FontFaceDescriptors;
}

export function descriptors_of(bytes: Uint8Array): FontFaceDescriptors {
  const style = sfnt_style(bytes);
  if (!style) return {};
  return { weight: style.weights ? `${style.weights[0]} ${style.weights[1]}` : String(style.weight), style: style.italic ? "italic" : "normal" };
}

export const file_faces = (bytes: Uint8Array): FaceSource[] => split_collection(bytes).map((face) => ({ bytes: face }));

export interface ShippedFace {
  url: string;
  weight: string;
  style: "normal" | "italic";
}

export function fetch_faces(faces: readonly ShippedFace[]): Promise<FaceSource[]> {
  return Promise.all(
    faces.map(async (face) => {
      const response = await fetch(face.url);
      if (!response.ok) throw new Error(`The built-in font didn't download (${response.status})`);
      return { bytes: new Uint8Array(await response.arrayBuffer()), descriptors: { weight: face.weight, style: face.style } };
    })
  );
}

/** The faces as `FontFace`s of `family`, loaded but not yet added to `document.fonts`. */
export async function load_faces(family: string, sources: readonly FaceSource[]): Promise<FontFace[]> {
  const faces = sources.map((source) => new FontFace(family, source.bytes, source.descriptors ?? descriptors_of(source.bytes)));
  const loaded = await Promise.allSettled(faces.map((face) => face.load()));
  const ok = faces.filter((_, index) => loaded[index].status === "fulfilled");
  if (!ok.length) throw new Error("The browser can't read it as a font");
  return ok;
}
