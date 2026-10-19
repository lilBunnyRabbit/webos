import { z } from "zod";
import { CARD_COLORS, clean_draft, create_card, type Card, type CardDraft } from "./data";
import { FORMAT_IDS } from "./formats";

export const SHARE_PREFIX = "WEBOS-CARDS:1:";

// A version 40 QR at ECC L holds 2953 bytes; past ~2000 a phone held up to a screen stops reading it reliably.
export const QR_LIMIT = 2000;

const CompactSchema = z.array(
  z.union([
    z.tuple([z.string(), z.string().min(1), z.enum(FORMAT_IDS), z.enum(CARD_COLORS)]),
    z.tuple([z.string(), z.string().min(1), z.enum(FORMAT_IDS), z.enum(CARD_COLORS), z.string()]),
  ])
);

function to_base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function from_base64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function through(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

// Tuples, not objects, and no photos, pins or use counts: every byte makes the QR denser.
export async function encode_share(cards: readonly Pick<Card, "name" | "code" | "format" | "color" | "notes">[]): Promise<string> {
  const compact = cards.map(({ name, code, format, color, notes }) => (notes ? [name, code, format, color, notes] : [name, code, format, color]));
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  return SHARE_PREFIX + to_base64url(await through(bytes, new CompressionStream("deflate-raw")));
}

export async function decode_share(payload: string): Promise<CardDraft[] | null> {
  const text = payload.trim();
  if (!text.startsWith(SHARE_PREFIX)) return null;
  try {
    const bytes = await through(from_base64url(text.slice(SHARE_PREFIX.length)), new DecompressionStream("deflate-raw"));
    const parsed = CompactSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    if (!parsed.success) return null;
    return parsed.data.map(([name, code, format, color, notes = ""]) => clean_draft({ name, code, format, color, notes }));
  } catch {
    return null;
  }
}

export function payload_of(scanned: string): string {
  const text = scanned.trim();
  if (text.startsWith(SHARE_PREFIX)) return text;
  try {
    const url = new URL(text);
    const query = url.hash.split("?")[1] ?? "";
    return new URLSearchParams(query).get("import") ?? text;
  } catch {
    return text;
  }
}

export function fits_qr(payload: string): boolean {
  return payload.length <= QR_LIMIT;
}

export const card_key = (card: Pick<Card, "code" | "format">) => `${card.format}\u0000${card.code}`;

export interface MergeResult {
  cards: Card[];
  added: Card[];
  skipped: number;
}

export function merge_cards(existing: readonly Card[], incoming: readonly Card[]): MergeResult {
  const seen = new Set(existing.map(card_key));
  const added: Card[] = [];
  for (const card of incoming) {
    const key = card_key(card);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(card);
  }
  return { cards: [...existing, ...added], added, skipped: incoming.length - added.length };
}

export function cards_from_drafts(drafts: readonly CardDraft[], new_id: () => string, now: number): Card[] {
  return drafts.map((draft) => create_card(draft, new_id(), now));
}
