export const Mark = { MARK: "mark", BOLD: "bold", ITALIC: "italic", TAG: "tag", BULLET: "bullet" } as const;
export type Mark = (typeof Mark)[keyof typeof Mark];

export const LineKind = { TEXT: "text", H1: "h1", H2: "h2", H3: "h3", LIST: "list" } as const;
export type LineKind = (typeof LineKind)[keyof typeof LineKind];

export type Segment = { text: string; marks: Mark[] } | { media: string };

export interface Line {
  kind: LineKind;
  segments: Segment[];
}

const HEADING = /^(#{1,3})[ \t]+/;
const LIST = /^([ \t]*)([-*+]|\d{1,3}[.)])([ \t]+)/;
const INLINE =
  /!\[[^\]\n]*\]\(media:([0-9a-f]{32})\)|\*\*(?=\S)(.*?\S)\*\*|(?<![*\p{L}\p{N}])\*(?=[^\s*])([^*]*?[^\s*])\*(?!\*)|(?<![\p{L}\p{N}_])_(?=[^\s_])([^_]*?[^\s_])_(?![\p{L}\p{N}_])|(?<!\S)#[\p{L}\p{N}_-]+/gu;

function inline(text: string, marks: Mark[]): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(new RegExp(INLINE.source, INLINE.flags))) {
    if (match.index > last) out.push({ text: text.slice(last, match.index), marks });
    const [whole, media, bold, star, underscore] = match;
    if (media) out.push({ media });
    else if (bold !== undefined)
      out.push({ text: "**", marks: [...marks, Mark.MARK] }, ...inline(bold, [...marks, Mark.BOLD]), {
        text: "**",
        marks: [...marks, Mark.MARK],
      });
    else if (star !== undefined || underscore !== undefined) {
      const fence = whole[0];
      out.push({ text: fence, marks: [...marks, Mark.MARK] }, ...inline(star ?? underscore, [...marks, Mark.ITALIC]), {
        text: fence,
        marks: [...marks, Mark.MARK],
      });
    } else out.push({ text: whole, marks: [...marks, Mark.TAG] });
    last = match.index + whole.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), marks });
  return out;
}

/**
 * The body as styled lines, live-preview style: every character stays (markers dimmed, not hidden), so the text a line
 * shows is exactly the text it stores, and the caret maps one to one.
 */
export function format_lines(body: string): Line[] {
  return body.split("\n").map((line): Line => {
    const heading = HEADING.exec(line);
    if (heading) {
      const kind = ([LineKind.H1, LineKind.H2, LineKind.H3] as const)[heading[1].length - 1];
      return {
        kind,
        segments: [{ text: heading[0], marks: [Mark.MARK] }, ...inline(line.slice(heading[0].length), [])],
      };
    }
    const list = LIST.exec(line);
    if (list)
      return {
        kind: LineKind.LIST,
        segments: [{ text: list[0], marks: [Mark.BULLET] }, ...inline(line.slice(list[0].length), [])],
      };
    return { kind: LineKind.TEXT, segments: inline(line, []) };
  });
}

export interface Edit {
  body: string;
  caret: number;
}

export function break_line(body: string, start: number, end: number, continue_list = true): Edit {
  const line_start = body.lastIndexOf("\n", start - 1) + 1;
  const line_end = body.indexOf("\n", start) === -1 ? body.length : body.indexOf("\n", start);
  const list = continue_list && start === end ? LIST.exec(body.slice(line_start, line_end)) : null;
  if (list && start >= line_start + list[0].length) {
    if (!body.slice(line_start + list[0].length, line_end).trim()) {
      return { body: body.slice(0, line_start) + body.slice(line_start + list[0].length), caret: line_start };
    }
    const marker = /^\d/.test(list[2]) ? `${Number.parseInt(list[2], 10) + 1}${list[2].slice(-1)}` : list[2];
    const insert = `\n${list[1]}${marker}${list[3]}`;
    return { body: body.slice(0, start) + insert + body.slice(end), caret: start + insert.length };
  }
  return { body: `${body.slice(0, start)}\n${body.slice(end)}`, caret: start + 1 };
}
