export const SPEED_OPTIONS = [0.1, 0.25, 0.5, 1, 1.5, 2, 4];

/** Videos don't expose their frame rate, so a "frame" is a fixed 1/30 s slice. */
export const VIDEO_FPS = 30;

/** Picker filter, in association syntax. Extensions cover videos whose MIME the browser can't derive. */
export const ACCEPT = [".gif", "image/gif", "video/*", ".mp4", ".webm", ".mov", ".m4v", ".mkv", ".ogv", ".avi"];

export interface VideoMeta {
  width: number;
  height: number;
  duration_ms: number;
  frame_count: number;
}

export function is_video_file(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv|ogv|avi)$/i.test(file.name);
}

export function is_gif_file(file: File): boolean {
  return file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
}

export function is_media_file(file: File): boolean {
  return is_gif_file(file) || is_video_file(file) || file.type.startsWith("image/");
}

export function format_ms(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function load_video_meta(url: string): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.addEventListener(
      "loadedmetadata",
      () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          duration_ms: duration * 1000,
          frame_count: Math.max(1, Math.round(duration * VIDEO_FPS)),
        });
      },
      { once: true }
    );
    video.addEventListener("error", () => reject(new Error("Failed to read video metadata")), { once: true });
    video.src = url;
  });
}
