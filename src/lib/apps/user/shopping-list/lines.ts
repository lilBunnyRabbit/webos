import type { Bounds } from "$lib/core/utils/type";
import { match_word, snap_line, type Vocabulary } from "./snap";

/** A piece of text the reader found, one or more words. */
export interface OcrBox extends Bounds {
  text: string;
  /** 0-100. */
  confidence: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  left: number;
  right: number;
  height: number;
}
export type OcrLine = OcrWord[];
export interface OcrPage {
  lines: OcrLine[];
}

/** Boxes whose middles sit within half a box height of each other share a row, left to right. */
export function box_rows(boxes: readonly OcrBox[]): OcrPage {
  const rows: { middle: number; height: number; boxes: OcrBox[] }[] = [];
  const middle = (box: OcrBox) => box.y + box.height / 2;
  for (const box of [...boxes].sort((a, b) => middle(a) - middle(b))) {
    const row = rows.find((candidate) => Math.abs(candidate.middle - middle(box)) < Math.min(candidate.height, box.height) / 2);
    if (row) row.boxes.push(box);
    else rows.push({ middle: middle(box), height: box.height, boxes: [box] });
  }
  return {
    lines: rows.map((row) =>
      row.boxes
        .sort((a, b) => a.x - b.x)
        .map((box) => ({ text: box.text, confidence: box.confidence, left: box.x, right: box.x + box.width, height: box.height }))
    ),
  };
}

const BULLET = /^(?:[-–—*•·▪◦○●□■☐☑✓✔>+]+|\[[ xX✓]?\]|\(?\d{1,2}[.)])\s+/u;

export function clean_lines(text: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/\s+/g, " ").trim();
    while (BULLET.test(line)) line = line.replace(BULLET, "");
    line = line.replace(/[,;.]+$/, "").trim();
    if (!/\p{L}/u.test(line)) continue;
    const key = line.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines;
}

/** On a real handwritten list PP-OCRv5 was 76-100 sure of every upright word, and under 60 for almost all of a turned read. */
export const MIN_CONFIDENCE = 60;
/** A gap wider than a box is tall is a second column: the reader already keeps the words of one item in one box. */
const COLUMN_GAP = 1;

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

function columns(line: OcrLine): OcrLine[] {
  const height = median(line.filter((word) => /\p{L}/u.test(word.text)).map((word) => word.height));
  const parts: OcrLine[] = [];
  line.forEach((word, index) => {
    if (index === 0 || word.left - line[index - 1].right > COLUMN_GAP * height) parts.push([word]);
    else parts.at(-1)!.push(word);
  });
  return parts;
}

const readable = (word: OcrWord, min_confidence: number) => word.confidence >= min_confidence && /[\p{L}\p{N}]/u.test(word.text);

function mostly_symbols(text: string): boolean {
  const visible = text.replace(/\s/g, "");
  const letters = visible.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return letters < 2 || letters < visible.length / 2;
}

/**
 * One line per item: columns split apart, symbols and unsure words dropped, the rest snapped to `vocabulary`. An unsure
 * word that snaps to a known one stays: being unsure doesn't make a read wrong.
 */
export function page_lines(page: OcrPage, vocabulary: Vocabulary, min_confidence = MIN_CONFIDENCE): string[] {
  const texts: string[] = [];
  for (const line of page.lines) {
    for (const part of columns(line)) {
      const text = part
        .filter((word) => readable(word, min_confidence) || (/\p{L}{4}/u.test(word.text) && match_word(word.text, vocabulary) !== null))
        .map((word) => word.text)
        .join(" ");
      if (!mostly_symbols(text)) texts.push(snap_line(text, vocabulary));
    }
  }
  return clean_lines(texts.join("\n"));
}

const letters = (words: OcrWord[]) => words.reduce((sum, word) => sum + (word.text.match(/\p{L}/gu)?.length ?? 0), 0);

/** Letters in confident words: the read that's the right way up has the most. */
export function page_score(page: OcrPage, min_confidence = MIN_CONFIDENCE): number {
  return letters(page.lines.flat().filter((word) => readable(word, min_confidence)));
}

/** On a real list every upright letter was in a sure word; upside down 15% were, sideways none. */
export function is_poor(page: OcrPage, min_confidence = MIN_CONFIDENCE): boolean {
  const all = letters(page.lines.flat());
  return all === 0 || page_score(page, min_confidence) / all < 0.4;
}
