import { z } from "zod";

export const APP_ID = "glimpse";
export const INDEX_FILE = "index.json";
export const PHOTOS = "photos";
export const THUMBS = "thumbs";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const EXPIRY = [
  { value: "1h", label: "1 h", ms: HOUR },
  { value: "24h", label: "24 h", ms: DAY },
  { value: "3d", label: "3 d", ms: 3 * DAY },
  { value: "1w", label: "1 w", ms: 7 * DAY },
] as const;
export type Expiry = (typeof EXPIRY)[number]["value"];
export const DEFAULT_EXPIRY: Expiry = "24h";

export function expiry_ms(expiry: Expiry): number {
  return EXPIRY.find((option) => option.value === expiry)!.ms;
}

const PhotoSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  taken: z.number(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const BatchSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  created: z.number(),
  expires: z.number(),
  photos: z.array(PhotoSchema),
});

export const IndexSchema = z.object({ version: z.literal(1), batches: z.array(BatchSchema) });

export type Photo = z.infer<typeof PhotoSchema>;
export type Batch = z.infer<typeof BatchSchema>;
export type GlimpseIndex = z.infer<typeof IndexSchema>;

export interface ViewerItem {
  photo: Photo;
  batch: Batch;
}

export const EMPTY_INDEX: GlimpseIndex = { version: 1, batches: [] };

export const photo_file = (id: string) => `${id}.jpg`;

export function new_id(now = Date.now()): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newest_first(batches: Batch[]): Batch[] {
  return [...batches].sort((a, b) => b.created - a.created);
}

export function expired(batches: Batch[], now: number): Batch[] {
  return batches.filter((batch) => batch.expires <= now);
}

export function orphans(names: string[], batches: Batch[], keep: ReadonlySet<string> = new Set()): string[] {
  const owned = new Set(batches.flatMap((batch) => batch.photos.map((photo) => photo_file(photo.id))));
  return names.filter((name) => !owned.has(name) && !keep.has(name));
}

export function without_photo(batches: Batch[], photo_id: string): Batch[] {
  return batches
    .map((batch) => (batch.photos.some((photo) => photo.id === photo_id) ? { ...batch, photos: batch.photos.filter((photo) => photo.id !== photo_id) } : batch))
    .filter((batch) => batch.photos.length > 0);
}

export function time_left(expires: number, now: number): string {
  const left = expires - now;
  if (left < 60_000) return "under a minute";
  if (left < HOUR) return `${Math.floor(left / 60_000)} min`;
  if (left < 2 * DAY) return `${Math.floor(left / HOUR)} h`;
  return `${Math.floor(left / DAY)} d`;
}

function same_day(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function batch_title(batch: Batch, now: number): string {
  if (batch.name) return batch.name;
  const at = new Date(batch.created);
  const time = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const today = new Date(now);
  if (same_day(at, today)) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (same_day(at, yesterday)) return `Yesterday ${time}`;
  return `${at.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

export function picture_name(taken: number): string {
  const at = new Date(taken);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Glimpse ${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}.jpg`;
}
