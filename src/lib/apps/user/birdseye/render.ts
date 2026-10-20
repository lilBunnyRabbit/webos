import type { Bounds, Dimensions } from "$lib/core/utils/type";
import type { CameraAt } from "./path";

export const EdgeFill = { BLUR: "blur", BLACK: "black", THEME: "theme" } as const;
export type EdgeFill = (typeof EdgeFill)[keyof typeof EdgeFill];

export const ZOOM = { MIN: 1, MAX: 4, DEFAULT: 1.5 } as const;

export const THEME_COLORS = [
  { value: "background-darkest", label: "Darkest" },
  { value: "background", label: "Window" },
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "tertiary", label: "Tertiary" },
] as const;
export type ThemeColor = (typeof THEME_COLORS)[number]["value"];

const BLACK = "#000";
const BLUR_DIM = 0.5;

export interface RenderSettings {
  zoom: number;
  follow_size: boolean;
  fill: EdgeFill;
  color: string;
}

export function centre_camera(source: Dimensions): CameraAt {
  return { cx: source.width / 2, cy: source.height / 2, scale: 1 };
}

export function frame_rect(
  source: Dimensions,
  output: Dimensions,
  camera: CameraAt,
  settings: Pick<RenderSettings, "zoom" | "follow_size">
): Bounds {
  const factor =
    ((output.width / source.width) * settings.zoom) / (settings.follow_size ? Math.max(camera.scale, 1e-3) : 1);
  return {
    x: output.width / 2 - camera.cx * factor,
    y: output.height / 2 - camera.cy * factor,
    width: source.width * factor,
    height: source.height * factor,
  };
}

export function cover_rect(source: Dimensions, output: Dimensions, margin = 0): Bounds {
  const factor = Math.max((output.width + margin * 2) / source.width, (output.height + margin * 2) / source.height);
  const width = source.width * factor;
  const height = source.height * factor;
  return { x: (output.width - width) / 2, y: (output.height - height) / 2, width, height };
}

export function blur_radius(output: Dimensions): number {
  return Math.max(4, Math.round(Math.max(output.width, output.height) / 40));
}

export function read_token(token: ThemeColor): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim() || BLACK;
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function draw_locked(
  context: Context2D,
  frame: CanvasImageSource,
  source: Dimensions,
  output: Dimensions,
  camera: CameraAt,
  settings: RenderSettings
): void {
  context.save();
  if (settings.fill === EdgeFill.BLUR) {
    const radius = blur_radius(output);
    // Grown past the edges so the blur doesn't fade into transparent at the border.
    const back = cover_rect(source, output, radius * 2);
    context.filter = `blur(${radius}px) brightness(${BLUR_DIM})`;
    context.drawImage(frame, back.x, back.y, back.width, back.height);
    context.filter = "none";
  } else {
    context.fillStyle = settings.fill === EdgeFill.BLACK ? BLACK : settings.color;
    context.fillRect(0, 0, output.width, output.height);
  }
  const rect = frame_rect(source, output, camera, settings);
  context.imageSmoothingQuality = "high";
  context.drawImage(frame, rect.x, rect.y, rect.width, rect.height);
  context.restore();
}
