export interface Replacement {
  start: number;
  end: number;
  text: string;
}

const OPENS_AFTER = /[\s([{—–“‘-]$/;
const URL_LIKE = /:\/\/|^www\.|^mailto:/i;

export function smarten(text: string, offset: number): Replacement | null {
  if (offset < 1 || offset > text.length) return null;
  const typed = text[offset - 1];
  const before = text.slice(0, offset - 1);
  if (URL_LIKE.test(before.split(/\s/).at(-1) ?? "")) return null;
  const opening = before === "" || OPENS_AFTER.test(before);
  if (typed === '"') return { start: offset - 1, end: offset, text: opening ? "“" : "”" };
  if (typed === "'") return { start: offset - 1, end: offset, text: opening ? "‘" : "’" };
  if (typed === "-" && before.endsWith("-")) return { start: offset - 2, end: offset, text: "–" };
  if (typed === "-" && before.endsWith("–")) return { start: offset - 2, end: offset, text: "—" };
  if (typed === "." && before.endsWith("..")) return { start: offset - 3, end: offset, text: "…" };
  return null;
}
