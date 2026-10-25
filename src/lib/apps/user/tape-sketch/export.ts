import type { Sketch } from "./model";
import { export_scene, scene_svg, type Palette } from "./svg";

const PNG_DENSITY = 2;

// Theme tokens are OKLCH; an exported file should open anywhere, so the canvas turns each into plain sRGB hex.
function token_hex(probe: CanvasRenderingContext2D, token: string, alpha = 1): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000000";
  probe.fillStyle = value || "#000000";
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  const hex = `#${[r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
  return alpha < 1
    ? `${hex}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, "0")}`
    : hex;
}

export function theme_palette(): Palette {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const probe = canvas.getContext("2d", { willReadFrequently: true })!;
  return {
    paper: token_hex(probe, "background"),
    ink: token_hex(probe, "foreground"),
    muted: token_hex(probe, "foreground", 0.6),
    accent: token_hex(probe, "primary"),
    chip: token_hex(probe, "background-light"),
  };
}

export function sketch_svg(sketch: Sketch): string | null {
  const built = export_scene(sketch);
  return built ? scene_svg(built.scene, built.box, theme_palette()) : null;
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
