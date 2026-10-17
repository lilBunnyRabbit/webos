import type { SvgSize } from "./optimize";

export async function rasterize(svg: string, { width, height }: SvgSize): Promise<OffscreenCanvas> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("The browser couldn't draw this SVG");
    }
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
