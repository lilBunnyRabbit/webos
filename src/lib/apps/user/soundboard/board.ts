import { z } from "zod";

export const PadColor = {
  PRIMARY: "primary",
  SECONDARY: "secondary",
  TERTIARY: "tertiary",
  ACCENT: "accent",
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
} as const;
export type PadColor = (typeof PadColor)[keyof typeof PadColor];
export const PAD_COLORS = Object.values(PadColor);

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
export const PAD_KEYS: readonly string[] = [...DIGITS, ...LETTERS];

export const PadSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  sound: z.string().min(1),
  color: z.enum(PadColor),
  volume: z.number().min(0).max(1),
  key: z
    .string()
    .refine((key) => PAD_KEYS.includes(key))
    .nullable(),
  loop: z.boolean(),
});
export type Pad = z.infer<typeof PadSchema>;

export const BoardSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  pads: z.array(PadSchema),
});
export type Board = z.infer<typeof BoardSchema>;

export const BoardFileSchema = z.object({
  version: z.literal(1),
  boards: z.array(BoardSchema).min(1),
});
export type BoardFile = z.infer<typeof BoardFileSchema>;

export const DEFAULT_BOARD_ID = "main";
export const EMPTY_FILE: BoardFile = { version: 1, boards: [{ id: DEFAULT_BOARD_ID, name: "My board", pads: [] }] };

const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "oga", "opus", "m4a", "aac", "flac", "weba", "webm"];

// OPFS files often come back with an empty type.
export function is_audio(name: string, type = ""): boolean {
  if (type.startsWith("audio/")) return true;
  if (type && type !== "application/octet-stream" && type !== "video/webm") return false;
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return name.includes(".") && AUDIO_EXTENSIONS.includes(extension);
}

export function label_from_file(name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const label = stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return (label || "Sound").slice(0, 40);
}

export function used_keys(pads: readonly Pad[], except?: string): Set<string> {
  return new Set(pads.filter((pad) => pad.id !== except && pad.key !== null).map((pad) => pad.key!));
}

export function free_keys(pads: readonly Pad[], except?: string): string[] {
  const used = used_keys(pads, except);
  return PAD_KEYS.filter((key) => !used.has(key));
}

export function next_key(pads: readonly Pad[]): string | null {
  const used = used_keys(pads);
  return DIGITS.find((key) => !used.has(key)) ?? null;
}

export function next_color(pads: readonly Pad[]): PadColor {
  return PAD_COLORS[pads.length % PAD_COLORS.length];
}

export function create_pad(pads: readonly Pad[], sound: string, file_name: string, id: string): Pad {
  return { id, label: label_from_file(file_name), sound, color: next_color(pads), volume: 1, key: next_key(pads), loop: false };
}

export function move_pad(pads: readonly Pad[], id: string, index: number): Pad[] {
  const from = pads.findIndex((pad) => pad.id === id);
  if (from < 0) return [...pads];
  const next = pads.filter((pad) => pad.id !== id);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, pads[from]);
  return next;
}

export function sound_in_use(file: BoardFile, sound: string, except?: string): boolean {
  return file.boards.some((board) => board.pads.some((pad) => pad.id !== except && pad.sound === sound));
}

export function sounds_freed_by_board(file: BoardFile, board_id: string): string[] {
  const board = file.boards.find((entry) => entry.id === board_id);
  if (!board) return [];
  const elsewhere = new Set(file.boards.filter((entry) => entry.id !== board_id).flatMap((entry) => entry.pads.map((pad) => pad.sound)));
  return [...new Set(board.pads.map((pad) => pad.sound))].filter((sound) => !elsewhere.has(sound));
}

export function unique_board_name(boards: readonly Board[], base: string): string {
  const taken = new Set(boards.map((board) => board.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}
