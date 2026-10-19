import { z } from "zod";
import { FORMAT_IDS, guess_format, type CardFormat } from "./formats";

export const CARDS_APP_ID = "cards";
export const CARDS_FILE = "cards.json";
export const CARDS_VERSION = 1;

export const CARD_COLORS = ["primary", "secondary", "tertiary", "accent", "info", "success", "warning"] as const;
export type CardColor = (typeof CARD_COLORS)[number];

export const PhotoSide = { FRONT: "front", BACK: "back" } as const;
export type PhotoSide = (typeof PhotoSide)[keyof typeof PhotoSide];

export const CardSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  code: z.string(),
  format: z.enum(FORMAT_IDS),
  color: z.enum(CARD_COLORS),
  notes: z.string(),
  pinned: z.boolean(),
  uses: z.number().int().min(0),
  used_at: z.number().nullable(),
  created_at: z.number(),
  photos: z.object({ front: z.boolean(), back: z.boolean() }),
});
export type Card = z.infer<typeof CardSchema>;

export const CardsFileSchema = z.object({
  version: z.literal(CARDS_VERSION),
  cards: z.array(CardSchema),
});
export type CardsFile = z.infer<typeof CardsFileSchema>;

export const EMPTY_FILE: CardsFile = { version: CARDS_VERSION, cards: [] };

export function parse_cards_file(text: string): CardsFile | null {
  try {
    const result = CardsFileSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export interface CardDraft {
  name: string;
  code: string;
  format: CardFormat;
  color: CardColor;
  notes: string;
}

export function empty_draft(code = ""): CardDraft {
  return { name: "", code, format: guess_format(code), color: "primary", notes: "" };
}

export function create_card(draft: CardDraft, id: string, now: number): Card {
  return {
    id,
    ...clean_draft(draft),
    pinned: false,
    uses: 0,
    used_at: null,
    created_at: now,
    photos: { front: false, back: false },
  };
}

export function clean_draft(draft: CardDraft): CardDraft {
  return { ...draft, name: draft.name.trim(), code: draft.code.trim(), notes: draft.notes.trim() };
}

export function record_use(card: Card, now: number): Card {
  return { ...card, uses: card.uses + 1, used_at: now };
}

export function display_name(card: Pick<Card, "name" | "code">): string {
  return card.name || card.code || "Untitled card";
}

export function initial(name: string): string {
  return name.match(/[\p{L}\p{N}]/u)?.[0].toLocaleUpperCase() ?? "#";
}

export function sort_cards(cards: readonly Card[]): Card[] {
  return [...cards].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.uses - a.uses ||
      (b.used_at ?? 0) - (a.used_at ?? 0) ||
      display_name(a).localeCompare(display_name(b), undefined, { sensitivity: "base" })
  );
}

export function filter_cards(cards: readonly Card[], query: string): Card[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...cards];
  return cards.filter((card) => [card.name, card.code, card.notes].some((text) => text.toLocaleLowerCase().includes(needle)));
}

// A unique prefix also matches, so `card=spa` finds "Spar" from the shell.
export function find_card(cards: readonly Card[], ref: string): Card | null {
  const needle = ref.trim().toLocaleLowerCase();
  if (!needle) return null;
  const by_id = cards.find((card) => card.id === ref.trim());
  if (by_id) return by_id;
  const by_name = cards.find((card) => card.name.toLocaleLowerCase() === needle);
  if (by_name) return by_name;
  const starting = cards.filter((card) => card.name.toLocaleLowerCase().startsWith(needle));
  return starting.length === 1 ? starting[0] : null;
}
