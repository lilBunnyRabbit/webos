import { Marked, type Tokens } from "marked";
import { escape_html } from "$lib/core/utils";

export interface Heading {
  depth: number;
  text: string;
  id: string;
}

export interface Rendered {
  html: string;
  headings: Heading[];
  title: string | null;
  words: number;
}

function plain_text(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .trim();
}

export function slugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base =
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .trim()
        .replace(/\s+/g, "-") || "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
}

export function render_markdown(markdown: string): Rendered {
  const headings: Heading[] = [];
  const slug = slugger();
  const marked = new Marked({
    gfm: true,
    async: false,
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        const text = plain_text(inner);
        const id = slug(text);
        headings.push({ depth, text, id });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
    },
  });
  const html = marked.parse(markdown) as string;
  const words = markdown.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  return { html, headings, title: headings.find((h) => h.depth === 1)?.text ?? null, words };
}

// A single level-1 heading is the title, so the list starts one level down.
export function toc_html(headings: Heading[]): string {
  if (headings.length === 0) return "";
  const top = headings.filter((h) => h.depth === 1).length <= 1 ? 2 : 1;
  const items = headings.filter((h) => h.depth >= top && h.depth <= top + 1);
  if (items.length === 0) return "";
  const list = items
    .map((h) => `<li class="toc-${h.depth - top + 1}"><a href="#${h.id}">${escape_html(h.text)}</a></li>`)
    .join("");
  return `<nav class="toc"><p class="toc-title">Contents</p><ol>${list}</ol></nav>`;
}
