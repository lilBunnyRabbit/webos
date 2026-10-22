export interface IcoEntry {
  size: number;
  png: Uint8Array;
}

const HEADER_SIZE = 6;
const ENTRY_SIZE = 16;
const ICON_TYPE = 1;
const BITS_PER_PIXEL = 32;

// PNG-in-ICO (Vista and later): entries hold whole PNG files, not BMPs. The size byte stores 256 as 0.
export function write_ico(entries: IcoEntry[]): Uint8Array<ArrayBuffer> {
  if (!entries.length) throw new Error("An icon needs at least one image");
  for (const { size } of entries)
    if (!Number.isInteger(size) || size < 1 || size > 256) throw new Error(`${size} px doesn't fit in an icon (1–256)`);

  const directory = HEADER_SIZE + entries.length * ENTRY_SIZE;
  const total = entries.reduce((sum, entry) => sum + entry.png.length, directory);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, ICON_TYPE, true);
  view.setUint16(4, entries.length, true);

  let offset = directory;
  entries.forEach(({ size, png }, index) => {
    const at = HEADER_SIZE + index * ENTRY_SIZE;
    view.setUint8(at, size % 256);
    view.setUint8(at + 1, size % 256);
    view.setUint8(at + 2, 0);
    view.setUint8(at + 3, 0);
    view.setUint16(at + 4, 1, true);
    view.setUint16(at + 6, BITS_PER_PIXEL, true);
    view.setUint32(at + 8, png.length, true);
    view.setUint32(at + 12, offset, true);
    bytes.set(png, offset);
    offset += png.length;
  });
  return bytes;
}

const ICO_SIZES = [16, 32, 48, 256];

/** The usual Windows sizes up to the image's own, never scaled up past it; 256 px at most. */
export function ico_sizes(longest: number): number[] {
  const top = Math.min(256, Math.max(1, Math.round(longest)));
  return [...ICO_SIZES.filter((size) => size < top), top];
}

/** Square entries, the image centred and scaled to fit with transparent margins. */
export async function encode_ico_image(image: ImageData): Promise<Uint8Array<ArrayBuffer>> {
  const bitmap = await createImageBitmap(image);
  try {
    const longest = Math.max(image.width, image.height);
    const entries: IcoEntry[] = [];
    for (const size of ico_sizes(longest)) {
      const canvas = new OffscreenCanvas(size, size);
      const context = canvas.getContext("2d")!;
      context.imageSmoothingQuality = "high";
      const width = Math.max(1, Math.round((image.width * size) / longest));
      const height = Math.max(1, Math.round((image.height * size) / longest));
      context.drawImage(bitmap, Math.floor((size - width) / 2), Math.floor((size - height) / 2), width, height);
      const png = await canvas.convertToBlob({ type: "image/png" });
      entries.push({ size, png: new Uint8Array(await png.arrayBuffer()) });
    }
    return write_ico(entries);
  } finally {
    bitmap.close();
  }
}
