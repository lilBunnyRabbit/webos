export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "paragraph"; lines: Inline[][] };

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)/g;

export function parse_inline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push({ kind: "text", text: text.slice(last, match.index) });
    const [, code, bold, star, underscore, label, href, url] = match;
    if (code !== undefined) out.push({ kind: "code", text: code });
    else if (bold !== undefined) out.push({ kind: "bold", text: bold });
    else if (star !== undefined || underscore !== undefined) out.push({ kind: "italic", text: star ?? underscore });
    else if (label !== undefined) out.push({ kind: "link", text: label, href });
    else out.push({ kind: "link", text: url, href: url });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** Markdown-lite (Kanban card notes, Forms, app guides): headings, `-`/`*` lists and paragraphs; never HTML, so nothing is injected. */
export function parse_markdown(source: string): Block[] {
  const blocks: Block[] = [];
  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    const previous = blocks.at(-1);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, inlines: parse_inline(heading[2]) });
    } else if (item) {
      if (previous?.kind === "list") previous.items.push(parse_inline(item[1]));
      else blocks.push({ kind: "list", items: [parse_inline(item[1])] });
    } else if (line.trim() === "") {
      if (previous && previous.kind !== "heading") blocks.push({ kind: "paragraph", lines: [] });
    } else if (previous?.kind === "paragraph") {
      previous.lines.push(parse_inline(line));
    } else {
      blocks.push({ kind: "paragraph", lines: [parse_inline(line)] });
    }
  }
  return blocks.filter((block) => block.kind !== "paragraph" || block.lines.length > 0);
}
