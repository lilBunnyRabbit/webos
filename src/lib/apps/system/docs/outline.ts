import { plain } from "$kit/utils/roadmap";

export interface Heading {
  depth: number;
  text: string;
  slug: string;
}

export interface Outline {
  title: string;
  headings: Heading[];
}

// GitHub's anchor rules, so `file.md#behaviour--invariants` links written for GitHub land on the same heading here.
export function slugify(text: string): string {
  return plain(text)
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

export class Slugger {
  private readonly seen = new Map<string, number>();

  slug(text: string): string {
    const base = slugify(text);
    const count = this.seen.get(base) ?? 0;
    this.seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  }
}

export function outline(markdown: string, fallback = ""): Outline {
  const slugger = new Slugger();
  const headings: Heading[] = [];
  let title = "";
  let fence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const depth = match[1].length;
    const slug = slugger.slug(match[2]);
    if (depth === 1 && !title) title = plain(match[2]);
    else if (depth === 2 || depth === 3) headings.push({ depth, text: plain(match[2]), slug });
  }
  return { title: title || fallback, headings };
}
