import { grid, type Cell, type Tones, type View } from "../../engine/step";

export const show = (char: string | undefined) => (char === undefined ? "" : char === " " ? "␣" : char === "\n" ? "⏎" : char);

export function chars_view(data: string, tones: Tones, title = "input"): View {
  const chars = [...data];
  const per_row = 32;
  const rows = Math.ceil(chars.length / per_row) || 1;
  return grid({
    title,
    row_labels: rows > 1 ? Array.from({ length: rows }, (_, r) => String(r * per_row)) : undefined,
    col_labels: rows === 1 ? chars.map((_, i) => String(i)) : undefined,
    rows: Array.from({ length: rows }, (_, r) => chars.slice(r * per_row, (r + 1) * per_row).map((char, i): Cell => ({ text: show(char), tone: tones[r * per_row + i] }))),
  });
}

export const ratio = (from: number, to: number) => (from === 0 ? "–" : `${Math.round((to / from) * 100)}%`);
