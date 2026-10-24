import type { Bounds, Dimensions } from "$lib/core/utils/type";
import { canvas_filter_works, draw_filtered, FilterKind, type FilterStep } from "$kit/utils/filter";
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

const SOFT_BLUR = 4;

// Blurring every frame by hand at full size is too slow for playback, so the backdrop is blurred small and scaled up.
function draw_soft_backdrop(context: Context2D, frame: CanvasImageSource, back: Bounds, output: Dimensions, radius: number): void {
  const shrink = Math.max(1, radius / SOFT_BLUR);
  const small = new OffscreenCanvas(Math.max(1, Math.ceil(output.width / shrink)), Math.max(1, Math.ceil(output.height / shrink)));
  const small_context = small.getContext("2d", { willReadFrequently: true })!;
  const steps: FilterStep[] = [
    { kind: FilterKind.BLUR, radius: radius / shrink },
    { kind: FilterKind.BRIGHTNESS, percent: BLUR_DIM * 100 },
  ];
  draw_filtered(small_context, steps, (target) => target.drawImage(frame, back.x / shrink, back.y / shrink, back.width / shrink, back.height / shrink));
  context.imageSmoothingQuality = "high";
  context.drawImage(small, 0, 0, output.width, output.height);
}

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
    if (canvas_filter_works()) {
      context.filter = `blur(${radius}px) brightness(${BLUR_DIM})`;
      context.drawImage(frame, back.x, back.y, back.width, back.height);
      context.filter = "none";
    } else {
      draw_soft_backdrop(context, frame, back, output, radius);
    }
  } else {
    context.fillStyle = settings.fill === EdgeFill.BLACK ? BLACK : settings.color;
    context.fillRect(0, 0, output.width, output.height);
  }
  const rect = frame_rect(source, output, camera, settings);
  context.imageSmoothingQuality = "high";
  context.drawImage(frame, rect.x, rect.y, rect.width, rect.height);
  context.restore();
}
