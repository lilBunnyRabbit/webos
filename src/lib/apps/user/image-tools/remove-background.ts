/** `#rgb` or `#rrggbb` → `[r, g, b]`; unparseable channels become 0. */
export function hex_to_rgb(hex: string): [number, number, number] {
  let raw = hex.replace(/^#/, "");
  if (raw.length === 3) raw = [...raw].map((char) => char + char).join("");
  const channel = (start: number) => Number.parseInt(raw.slice(start, start + 2), 16) || 0;
  return [channel(0), channel(2), channel(4)];
}

function pack(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

/** Makes every visible pixel whose RGB exactly matches one of `colours` fully transparent. */
export function remove_colours(
  source: CanvasImageSource & { width: number; height: number },
  colours: string[]
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(source, 0, 0);
  if (!colours.length) return canvas;

  const targets = new Set(colours.map((colour) => pack(...hex_to_rgb(colour))));
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    if (targets.has(pack(data[i], data[i + 1], data[i + 2]))) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}
