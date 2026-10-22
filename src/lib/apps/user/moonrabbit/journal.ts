import { z } from "zod";
import { FORMAT_VERSION, type JournalHeader } from "./crypto";
import { MOOD_LABELS, type Mood } from "./mood";

export const APP_ID = "moonrabbit";
/** One daily reminder for the app, not per journal. */
export const REMINDER_JOB = `${APP_ID}:reminder`;
export const JOURNAL_ROOT = "/home/Journal";
export const HEADER_FILE = "journal.json";
export const INDEX_FILE = "index.bin";
export const ENTRIES_DIR = "entries";
export const MEDIA_DIR = "media";
export const INBOX_DIR = "inbox";

const SealedSchema = z.object({ iv: z.string().min(1), data: z.string().min(1) });

export const HeaderSchema = z.object({
  version: z.literal(FORMAT_VERSION),
  id: z.string().regex(/^[0-9a-f]{32}$/),
  kdf: z.object({ iterations: z.number().int().min(1), salt: z.string().min(1) }),
  wraps: z.object({ phrase: SealedSchema, recovery: SealedSchema }),
  inbox_public_key: z.string().min(1),
  inbox_private_wrapped: SealedSchema,
}) satisfies z.ZodType<JournalHeader>;

const MoodFields = {
  mood: z.number().int().min(1).max(5).optional(),
  activities: z.array(z.string()).optional(),
  energy: z.number().min(0).max(10).optional(),
  sleep: z.number().min(0).max(24).optional(),
};

export const IndexEntrySchema = z.object({
  id: z.string().regex(/^[0-9a-f]{32}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  created: z.number(),
  updated: z.number(),
  title: z.string(),
  tags: z.array(z.string()),
  words: z.number().int().min(0),
  media: z.array(z.string()),
  template: z.string().optional(),
  ...MoodFields,
});
export type IndexEntry = z.infer<typeof IndexEntrySchema>;

export const ActivityDefSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(40),
  icon: z.string(),
  hidden: z.boolean().optional(),
});

/** `activities` is the journal's own activity list, encrypted with the index; absent until the user edits one. */
export const IndexSchema = z.object({
  version: z.literal(FORMAT_VERSION),
  entries: z.array(IndexEntrySchema),
  activities: z.array(ActivityDefSchema).optional(),
});
export type JournalIndex = z.infer<typeof IndexSchema>;

export const EntrySchema = z.object({
  id: z.string().regex(/^[0-9a-f]{32}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  created: z.number(),
  updated: z.number(),
  body: z.string(),
  template: z.string().optional(),
  ...MoodFields,
});
export type Entry = z.infer<typeof EntrySchema>;

export const EMPTY_INDEX: JournalIndex = { version: FORMAT_VERSION, entries: [] };

const MEDIA_TOKEN = /!\[[^\]]*\]\(media:([0-9a-f]{32})\)/g;

export function media_token(id: string): string {
  return `![photo](media:${id})`;
}

export function media_of(body: string): string[] {
  return [...new Set(Array.from(body.matchAll(MEDIA_TOKEN), (match) => match[1]))];
}

export function split_media(body: string): ({ text: string } | { media: string })[] {
  const parts: ({ text: string } | { media: string })[] = [];
  let last = 0;
  for (const match of body.matchAll(MEDIA_TOKEN)) {
    if (match.index > last) parts.push({ text: body.slice(last, match.index) });
    parts.push({ media: match[1] });
    last = match.index + match[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });
  return parts;
}

export function tags_of(body: string): string[] {
  const tags = new Set<string>();
  for (const match of body.replace(MEDIA_TOKEN, " ").matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu))
    tags.add(match[1].toLowerCase());
  return [...tags];
}

export function words_of(body: string): number {
  return body
    .replace(MEDIA_TOKEN, " ")
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export function title_of(body: string): string {
  const line = body
    .replace(MEDIA_TOKEN, "")
    .split("\n")
    .map((text) =>
      text
        .replace(/^#+\s*/, "")
        .replace(/\*\*(?=\S)(.*?\S)\*\*/g, "$1")
        .replace(/(?<![*\p{L}\p{N}])\*(?=[^\s*])([^*]*?[^\s*])\*(?!\*)/gu, "$1")
        .replace(/(?<![\p{L}\p{N}_])_(?=[^\s_])([^_]*?[^\s_])_(?![\p{L}\p{N}_])/gu, "$1")
        .trim()
    )
    .find((text) => text.length > 0);
  if (!line) return media_of(body).length ? "Photo" : "Empty entry";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

export function index_entry(entry: Entry): IndexEntry {
  const { body, ...rest } = entry;
  const title =
    !body.trim() && entry.mood ? `Feeling ${MOOD_LABELS[entry.mood as Mood].toLowerCase()}` : title_of(body);
  return { ...rest, title, tags: tags_of(body), words: words_of(body), media: media_of(body) };
}

export function newest_first(a: { date: string; created: number }, b: { date: string; created: number }): number {
  return a.date === b.date ? b.created - a.created : a.date < b.date ? 1 : -1;
}

/** "Days written this month", never a streak: a missed day costs nothing. */
export function days_written(entries: readonly { date: string }[], month: string): number {
  return new Set(entries.filter((entry) => entry.date.startsWith(`${month}-`)).map((entry) => entry.date)).size;
}

/** Every word must appear; `#tag` words match tags only. */
export function matches(entry: { body: string; date: string }, tags: readonly string[], query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = entry.body.replace(MEDIA_TOKEN, " ").toLowerCase();
  return terms.every((term) =>
    term.startsWith("#") ? tags.includes(term.slice(1)) : text.includes(term) || entry.date.includes(term)
  );
}

export interface Template {
  id: string;
  label: string;
  body: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "morning",
    label: "Morning",
    body: "## Today I want to\n\n\n## I'm looking forward to\n\n\n## One thing that would make today good\n\n",
  },
  {
    id: "evening",
    label: "Evening",
    body: "## What happened today\n\n\n## What went well\n\n\n## What I'd do differently\n\n",
  },
  { id: "gratitude", label: "Gratitude 3", body: "## Three things I'm grateful for\n\n1. \n2. \n3. \n" },
  { id: "brain-dump", label: "Brain dump", body: "## On my mind\n\n" },
];

export const PROMPTS = [
  "What made you smile today?",
  "What's taking up most of your thoughts right now?",
  "What did you learn today?",
  "Who did you enjoy spending time with recently?",
  "What would you tell yourself from a year ago?",
  "What's something small you're looking forward to?",
  "What drained your energy today, and what gave it back?",
  "What are you avoiding, and why?",
  "Describe today in three words.",
  "What's one thing you'd like to remember about this week?",
  "What surprised you lately?",
  "What would make tomorrow a good day?",
];

export function prompt_for(day: string, skip = 0): string {
  const [year, month, date] = day.split("-").map(Number);
  const ordinal = Math.floor(Date.UTC(year, month - 1, date) / 86_400_000);
  return PROMPTS[(((ordinal + skip) % PROMPTS.length) + PROMPTS.length) % PROMPTS.length];
}

export function clean_journal_name(name: string): string | null {
  const clean = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .slice(0, 60);
  return clean && !clean.startsWith(".") ? clean : null;
}
