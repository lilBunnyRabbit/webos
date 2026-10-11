/** `#rgb` or `#rrggbb` → `[r, g, b]`; unparseable channels become 0. */
export function hex_to_rgb(hex: string): [number, number, number] {
  let raw = hex.replace(/^#/, "");
  if (raw.length === 3) raw = [...raw].map((char) => char + char).join("");
  const channel = (start: number) => Number.parseInt(raw.slice(start, start + 2), 16) || 0;
  return [channel(0), channel(2), channel(4)];
}

/** Makes every visible pixel whose RGB exactly matches one of `colours` fully transparent. */
export function remove_colours(source: CanvasImageSource & { width: number; height: number }, colours: string[]): OffscreenCanvas {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(source, 0, 0);
  if (!colours.length) return canvas;

  const targets = colours.map(hex_to_rgb);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (targets.some((target) => target[0] === r && target[1] === g && target[2] === b)) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}
