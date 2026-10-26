export const CODE_BLOCK = "Code block.";

const FENCE = /^ {0,3}(`{3,}|~{3,})/gm;
const SENTENCE_END = /[.!?…]+(?=\s)|\n[ \t]*\n/g;
const LIST_NUMBER = /(?:^|\n)[ \t]*\d+$/;
const MARKDOWN_LINE = /\n(?=[ \t]*(?:[-*+] |\d+[.)] |#{1,6} |> |\|))|(?<=^ {0,3}#{1,6}[ \t][^\n]*)\n/g;

interface Fence {
  start: number;
  end: number | null;
}

function fences(text: string): Fence[] {
  const found: Fence[] = [];
  let open: { start: number; marker: string } | null = null;
  for (const match of text.matchAll(FENCE)) {
    const marker = match[1];
    if (!open) open = { start: match.index, marker };
    else if (marker[0] === open.marker[0] && marker.length >= open.marker.length) {
      const line_end = text.indexOf("\n", match.index);
      found.push({ start: open.start, end: line_end < 0 ? text.length : line_end });
      open = null;
    }
  }
  if (open) found.push({ start: open.start, end: null });
  return found;
}

export function replace_code_blocks(text: string): string {
  let result = "";
  let from = 0;
  for (const fence of fences(text)) {
    result += text.slice(from, fence.start) + `\n\n${CODE_BLOCK}\n\n`;
    from = fence.end ?? text.length;
  }
  return result + text.slice(from);
}

export function strip_markdown(text: string): string {
  return replace_code_blocks(text)
    .split("\n")
    .map(strip_line)
    .filter((line) => line !== "")
    .join("\n");
}

function strip_line(line: string): string {
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return "";
  if (/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.includes("-") && line.includes("|")) return "";
  let text = line
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/\s+#+\s*$/, "")
    .replace(/^(\s*>\s?)+/, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "");
  if (/^\s*\|.*\|\s*$/.test(text)) {
    text = text
      .trim()
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean)
      .join(", ");
  }
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/<(https?:\/\/[^>]+)>/g, "$1")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/`+([^`]+)`+/g, "$1")
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "$1")
    .replace(/(^|[^\w*])\*(?=\S)(.+?)(?<=\S)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, "$1$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1")
    .trim();
}

export function speakable(text: string, markdown: boolean): string {
  const plain = (markdown ? strip_markdown(text) : text).replace(/\s+/g, " ").trim();
  return /[\p{L}\p{N}]/u.test(plain) ? plain : "";
}

export interface Split {
  sentences: string[];
  rest: string;
}

// Markdown: an unclosed code fence waits whole, and a list item, heading, quote or table row starts a sentence.
export function split_sentences(text: string, markdown = false): Split {
  let head = text;
  let tail = "";
  if (markdown) {
    const open = fences(text).find((fence) => fence.end === null);
    if (open) {
      head = text.slice(0, open.start);
      tail = text.slice(open.start);
    }
    const closed = fences(head);
    const last = closed.at(-1);
    if (last?.end != null) {
      const cut = last.end;
      const before = split_sentences(head.slice(0, last.start), true);
      const after = split_sentences(head.slice(cut), true);
      return {
        sentences: [...before.sentences, ...(before.rest.trim() ? [before.rest.trim()] : []), CODE_BLOCK, ...after.sentences],
        rest: after.rest + tail,
      };
    }
  }

  const sentences: string[] = [];
  let start = 0;
  const ends = markdown ? new RegExp(`${SENTENCE_END.source}|${MARKDOWN_LINE.source}`, "gm") : new RegExp(SENTENCE_END.source, "g");
  for (const match of head.matchAll(ends)) {
    const end = match.index + match[0].length;
    if (match[0][0] === "." && LIST_NUMBER.test(head.slice(start, match.index))) continue;
    const sentence = head.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
  }
  return { sentences, rest: head.slice(start) + tail };
}
