export { Quality, QUALITIES } from "$kit/utils/video/plan";

export const GIF_FPS = { MIN: 5, MAX: 30, DEFAULT: 12 } as const;
export const GIF_WIDTH = { MIN: 16, MAX: 1920, DEFAULT: 480 } as const;

/** Picker filter, in association syntax. Extensions cover videos whose MIME the browser can't derive. */
export const VIDEO_ACCEPT = ["video/*", ".mp4", ".webm", ".mov", ".m4v", ".mkv", ".ogv"];

export function is_video_name(name: string): boolean {
  return /\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(name);
}
