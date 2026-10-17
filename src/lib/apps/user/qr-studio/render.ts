export interface Style {
  quiet: number;
  scale: number;
  dark: string;
  light: string;
  transparent: boolean;
}

export const DEFAULT_STYLE: Style = { quiet: 4, scale: 10, dark: "#000000", light: "#ffffff", transparent: false };

export function module_path(size: number, pick: (index: number) => boolean, offset = 0): string {
  let d = "";
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!pick(y * size + x)) {
        x++;
        continue;
      }
      const start = x;
      while (x < size && pick(y * size + x)) x++;
      d += `M${start + offset} ${y + offset}h${x - start}v1h${start - x}z`;
    }
  }
  return d;
}

export function image_side(size: number, style: Style): number {
  return (size + style.quiet * 2) * style.scale;
}

export function qr_svg(size: number, modules: Uint8Array, style: Style): string {
  const side = size + style.quiet * 2;
  const d = module_path(size, (index) => modules[index] === 1, style.quiet);
  const pixels = side * style.scale;
  const background = style.transparent ? "" : `<rect width="${side}" height="${side}" fill="${style.light}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges">${background}<path fill="${style.dark}" d="${d}"/></svg>`;
}

export function qr_canvas(size: number, modules: Uint8Array, style: Style): OffscreenCanvas {
  const canvas = new OffscreenCanvas(image_side(size, style), image_side(size, style));
  const context = canvas.getContext("2d")!;
  if (!style.transparent) {
    context.fillStyle = style.light;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.fillStyle = style.dark;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (modules[y * size + x]) context.fillRect((x + style.quiet) * style.scale, (y + style.quiet) * style.scale, style.scale, style.scale);
  return canvas;
}
