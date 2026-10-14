import { pad2 } from "$lib/core/utils";
export const RECORDINGS_DIR = "/home/Recordings";

export const Source = {
  MIC: "mic",
  SCREEN: "screen",
  CAMERA: "camera",
} as const;
export type Source = (typeof Source)[keyof typeof Source];

export const TakeKind = {
  AUDIO: "audio",
  VIDEO: "video",
  PHOTO: "photo",
} as const;
export type TakeKind = (typeof TakeKind)[keyof typeof TakeKind];

export const PhotoFormat = {
  JPEG: "image/jpeg",
  PNG: "image/png",
} as const;
export type PhotoFormat = (typeof PhotoFormat)[keyof typeof PhotoFormat];

const AUDIO_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];
const VIDEO_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
];

export function pick_mime(kind: "audio" | "video", is_supported: (type: string) => boolean): string {
  return (kind === "audio" ? AUDIO_TYPES : VIDEO_TYPES).find((type) => is_supported(type)) ?? "";
}

/**
 * Audio-only WebM gets `.weba` so the browser types it `audio/webm` and Media Preview plays it as audio, not as a black
 * video. MP4 audio is `.m4a` for the same reason.
 */
export function extension_for(mime: string, kind: TakeKind): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base === "image/png") return ".png";
  if (base === "image/jpeg") return ".jpg";
  if (base.endsWith("/ogg")) return ".ogg";
  if (base.endsWith("/mp4")) return kind === TakeKind.AUDIO ? ".m4a" : ".mp4";
  return kind === TakeKind.AUDIO ? ".weba" : ".webm";
}

const NAME_PREFIX: Record<Source, Record<TakeKind, string>> = {
  mic: { audio: "Voice", video: "Voice", photo: "Photo" },
  screen: { audio: "Screen", video: "Screen", photo: "Screen" },
  camera: { audio: "Video", video: "Video", photo: "Photo" },
};

export function take_name(source: Source, kind: TakeKind, mime: string, date: Date): string {
  const day = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const time = `${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}`;
  return `${NAME_PREFIX[source][kind]} ${day} ${time}${extension_for(mime, kind)}`;
}

const MEDIA_EXTENSIONS = [".weba", ".webm", ".m4a", ".mp4", ".ogg", ".png", ".jpg", ".jpeg"];

export function is_media_file(name: string): boolean {
  const lower = name.toLowerCase();
  return MEDIA_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function kind_of_file(name: string): TakeKind {
  const lower = name.toLowerCase();
  if (/\.(png|jpe?g)$/.test(lower)) return TakeKind.PHOTO;
  if (/\.(weba|m4a|ogg)$/.test(lower)) return TakeKind.AUDIO;
  return TakeKind.VIDEO;
}

/** Recording time from wall-clock stamps, so a throttled background tab still reports the real length. */
export interface Clock {
  banked: number;
  since: number | null;
}

export const clock_start = (now: number): Clock => ({ banked: 0, since: now });
export const clock_pause = (clock: Clock, now: number): Clock =>
  clock.since === null ? clock : { banked: clock.banked + (now - clock.since), since: null };
export const clock_resume = (clock: Clock, now: number): Clock =>
  clock.since === null ? { ...clock, since: now } : clock;
export const clock_elapsed = (clock: Clock, now: number): number =>
  clock.banked + (clock.since === null ? 0 : Math.max(0, now - clock.since));

/** Byte time-domain samples centre on 128; the RMS is scaled so normal speech fills most of the meter. */
export function level_of(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 3);
}

export function push_level(history: number[], level: number, length: number): number[] {
  const next = [...history, level];
  return next.length > length ? next.slice(next.length - length) : next;
}

export const CaptureError = {
  DENIED: "denied",
  MISSING: "missing",
  BUSY: "busy",
  UNSUPPORTED: "unsupported",
  OTHER: "other",
} as const;
export type CaptureError = (typeof CaptureError)[keyof typeof CaptureError];

export function classify_error(reason: unknown): CaptureError {
  const name = typeof reason === "object" && reason !== null && "name" in reason ? String(reason.name) : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return CaptureError.DENIED;
    case "NotFoundError":
    case "OverconstrainedError":
      return CaptureError.MISSING;
    case "NotReadableError":
    case "AbortError":
      return CaptureError.BUSY;
    case "NotSupportedError":
    case "TypeError":
      return CaptureError.UNSUPPORTED;
    default:
      return CaptureError.OTHER;
  }
}

const DEVICE_NAME: Record<Source, string> = { mic: "microphone", screen: "screen", camera: "camera" };

export interface ErrorCopy {
  title: string;
  description: string;
}

export function error_copy(error: CaptureError, source: Source): ErrorCopy {
  const device = DEVICE_NAME[source];
  switch (error) {
    case CaptureError.DENIED:
      return source === Source.SCREEN
        ? {
            title: "Screen sharing was cancelled",
            description: "Choose a window, tab or screen in the browser's picker to record it.",
          }
        : {
            title: `${device[0].toUpperCase()}${device.slice(1)} access is blocked`,
            description: `Allow the ${device} in the browser's site settings (the icon left of the address bar), then try again.`,
          };
    case CaptureError.MISSING:
      return {
        title: `No ${device} found`,
        description: `Connect a ${device}, or check that the system hasn't turned it off, then try again.`,
      };
    case CaptureError.BUSY:
      return {
        title: `The ${device} is busy`,
        description: `Another app or tab may be using it. Close that, then try again.`,
      };
    case CaptureError.UNSUPPORTED:
      return {
        title: "Recording isn't available here",
        description: "This browser doesn't allow capture on this page.",
      };
    default:
      return { title: `Couldn't start the ${device}`, description: "Something went wrong. Try again." };
  }
}
