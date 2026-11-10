import { is_hex, type Ink } from "./model";
import type { Palette } from "./svg";

const PNG_DENSITY = 2;

// Theme tokens are OKLCH; an exported file should open anywhere, so the canvas turns each into plain sRGB hex.
function css_hex(probe: CanvasRenderingContext2D, value: string): string {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000000";
  probe.fillStyle = value || "#000000";
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

export function theme_palette(): Palette {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const probe = canvas.getContext("2d", { willReadFrequently: true })!;
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => css_hex(probe, style.getPropertyValue(`--${name}`).trim());
  const ink = token("foreground");
  const cache = new Map<string, string>();
  return {
    paper: token("background"),
    ink,
    chip: token("background-light"),
    line: (color: Ink) => {
      if (color === null) return ink;
      if (is_hex(color)) return color;
      let hex = cache.get(color);
      if (!hex) {
        hex = token(color);
        cache.set(color, hex);
      }
      return hex;
    },
  };
}

export async function svg_to_png(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(image.naturalWidth * PNG_DENSITY);
    canvas.height = Math.ceil(image.naturalHeight * PNG_DENSITY);
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The PNG couldn't be encoded"))), "image/png")
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
