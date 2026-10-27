import { z } from "zod";

export const MOTION_DIR = "/home/Videos/Motion";
export const EVENTS_FILE = "events.json";

export interface MotionEvent {
  /** Wall-clock ms of the first and last frame that saw motion. */
  at: number;
  end: number;
  /** The highest share of watched pixels that changed, 0–1. */
  peak: number;
  cells: number[];
  /** The clip's file name in the day's folder. */
  clip: string;
}

const EventSchema = z.object({
  at: z.number().finite(),
  end: z.number().finite(),
  peak: z.number().min(0).max(1),
  cells: z.array(z.number().int().min(0)),
  clip: z.string().min(1),
});

const pad = (value: number) => String(value).padStart(2, "0");

export function day_of(wall: number): string {
  const date = new Date(wall);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function clip_name(wall: number): string {
  const date = new Date(wall);
  return `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.webm`;
}

export const is_day = (name: string) => /^\d{4}-\d{2}-\d{2}$/.test(name);

/** A bad entry is dropped alone; a file that isn't a list is no events. */
export function parse_events(text: string | null): MotionEvent[] {
  if (text === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = EventSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function serialize_events(events: MotionEvent[]): string {
  return JSON.stringify([...events].sort((a, b) => a.at - b.at), null, 2) + "\n";
}

/** Day folders older than the last `keep_days` days, today included. */
export function expired_days(days: string[], today: string, keep_days: number): string[] {
  const [year, month, day] = today.split("-").map(Number);
  const oldest = day_of(new Date(year, month - 1, day - (keep_days - 1)).getTime());
  return days.filter((name) => is_day(name) && name < oldest);
}
