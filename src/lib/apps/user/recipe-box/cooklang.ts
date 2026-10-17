export interface Amount {
  value: number | null;
  text: string;
  unit: string;
  /** `{=1%tsp}`: the same for any number of servings. */
  fixed: boolean;
}

export interface Ingredient {
  kind: "ingredient";
  name: string;
  amount: Amount | null;
  note: string;
  optional: boolean;
  /** `@./sauces/Hollandaise{}`: the path of another recipe, relative to the recipes folder, without `.cook`. */
  reference: string | null;
}

export interface Cookware {
  kind: "cookware";
  name: string;
  amount: Amount | null;
  optional: boolean;
}

export interface Timer {
  kind: "timer";
  name: string;
  amount: Amount | null;
}

export interface Text {
  kind: "text";
  value: string;
}

export type StepItem = Ingredient | Cookware | Timer | Text;

export interface Step {
  kind: "step";
  number: number;
  items: StepItem[];
}

export interface Note {
  kind: "note";
  text: string;
}

export type Block = Step | Note;

export interface Section {
  name: string | null;
  blocks: Block[];
}

export type MetaValue = string | string[];

export interface Recipe {
  metadata: Record<string, MetaValue>;
  sections: Section[];
}

const SIGILS = "@#~";
const WORD = /^[\p{L}\p{N}_'’-]*[\p{L}\p{N}_]/u;
const BRACED = /^([^@#~{}\n]*?)\{([^}]*)\}/;
const NOTE = /^\(([^)]*)\)/;
const SECTION = /^=+\s*(.*?)\s*=*\s*$/;
const META_LINE = /^>>\s*([^:]+?)\s*:\s*(.*)$/;

export function strip_comments(text: string): string {
  return text.replace(/\[-[\s\S]*?-\]/g, "").replace(/--.*$/gm, "");
}

export function parse_quantity(text: string): number | null {
  const cleaned = text.trim();
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(cleaned);
  if (mixed) return Number(mixed[3]) === 0 ? null : Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(cleaned);
  if (fraction) return Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2]);
  if (/^\d+([.,]\d+)?$|^[.,]\d+$/.test(cleaned)) return Number(cleaned.replace(",", "."));
  return null;
}

export function parse_amount(raw: string): Amount | null {
  const split = raw.indexOf("%");
  let text = (split >= 0 ? raw.slice(0, split) : raw).trim();
  const unit = split >= 0 ? raw.slice(split + 1).trim() : "";
  if (text === "" && unit === "") return null;
  const fixed = text.startsWith("=");
  if (fixed) text = text.slice(1).trim();
  return { value: parse_quantity(text), text, unit, fixed };
}

interface Token {
  name: string;
  amount: Amount | null;
  length: number;
}

function read_token(source: string, allow_empty_name: boolean): Token | null {
  const braced = BRACED.exec(source);
  if (braced && (allow_empty_name || braced[1].trim() !== "")) {
    return { name: braced[1].trim(), amount: parse_amount(braced[2]), length: braced[0].length };
  }
  const word = WORD.exec(source);
  if (word) return { name: word[0], amount: null, length: word[0].length };
  return null;
}

function reference_name(name: string): { name: string; reference: string | null } {
  if (!/^\.\.?\//.test(name)) return { name, reference: null };
  return { name: name.split("/").at(-1) ?? name, reference: name };
}

export function parse_step_text(text: string): StepItem[] {
  const items: StepItem[] = [];
  let plain = "";
  const flush = () => {
    if (plain !== "") items.push({ kind: "text", value: plain });
    plain = "";
  };
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (!SIGILS.includes(char)) {
      plain += char;
      index++;
      continue;
    }
    let cursor = index + 1;
    const optional = char !== "~" && text[cursor] === "?";
    if (optional) cursor++;
    const token = read_token(text.slice(cursor), char === "~");
    if (!token || (char === "~" && token.amount === null)) {
      plain += char;
      index++;
      continue;
    }
    cursor += token.length;
    flush();
    if (char === "@") {
      const note = NOTE.exec(text.slice(cursor));
      if (note) cursor += note[0].length;
      items.push({ kind: "ingredient", ...reference_name(token.name), amount: token.amount, note: note?.[1].trim() ?? "", optional });
    } else if (char === "#") {
      items.push({ kind: "cookware", name: token.name, amount: token.amount, optional });
    } else {
      items.push({ kind: "timer", name: token.name, amount: token.amount });
    }
    index = cursor;
  }
  flush();
  return items;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^(["'])(.*)\1$/.exec(trimmed);
  return quoted ? quoted[2] : trimmed;
}

/** The flat subset recipes use: `key: value`, `key: [a, b]` and `key:` followed by `- item` lines. */
export function parse_front_matter(lines: string[]): Record<string, MetaValue> {
  const metadata: Record<string, MetaValue> = {};
  let list_key: string | null = null;
  for (const line of lines) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && list_key) {
      const current = metadata[list_key];
      metadata[list_key] = [...(Array.isArray(current) ? current : []), unquote(item[1])];
      continue;
    }
    const pair = /^([^\s#][^:]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1].trim().toLowerCase();
    const value = pair[2].trim();
    list_key = value === "" ? key : null;
    const inline = /^\[(.*)\]$/.exec(value);
    metadata[key] = inline
      ? inline[1]
          .split(",")
          .map(unquote)
          .filter((entry) => entry !== "")
      : unquote(value);
  }
  return metadata;
}

export function parse_cook(source: string): Recipe {
  let lines = source.replace(/\r\n?/g, "\n").split("\n");
  let metadata: Record<string, MetaValue> = {};
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (end > 0) {
      metadata = parse_front_matter(lines.slice(1, end));
      lines = lines.slice(end + 1);
    }
  }

  const sections: Section[] = [{ name: null, blocks: [] }];
  let paragraph = "";
  let note: string[] = [];
  const section = () => sections.at(-1)!;
  const end_paragraph = () => {
    const text = paragraph.trim();
    paragraph = "";
    if (text === "") return;
    const number = section().blocks.filter((block) => block.kind === "step").length + 1;
    section().blocks.push({ kind: "step", number, items: parse_step_text(text) });
  };
  const end_note = () => {
    if (note.length > 0) section().blocks.push({ kind: "note", text: note.join(" ") });
    note = [];
  };

  for (const raw of strip_comments(lines.join("\n")).split("\n")) {
    const line = raw.trim();
    const meta = META_LINE.exec(line);
    if (line === "" || meta || line.startsWith(">") || line.startsWith("=")) end_paragraph();
    if (!line.startsWith(">") || meta) end_note();
    if (line === "") continue;
    if (meta) {
      metadata[meta[1].trim().toLowerCase()] = meta[2].trim();
    } else if (line.startsWith(">")) {
      note.push(line.slice(1).trim());
    } else if (line.startsWith("=")) {
      sections.push({ name: SECTION.exec(line)?.[1] ?? "", blocks: [] });
    } else if (line.endsWith("\\")) {
      paragraph += `${line.slice(0, -1).trimEnd()}\n`;
    } else {
      paragraph += paragraph === "" || paragraph.endsWith("\n") ? line : ` ${line}`;
    }
  }
  end_paragraph();
  end_note();

  return { metadata, sections: sections.filter((entry, index) => index > 0 || entry.blocks.length > 0) };
}

export function steps(recipe: Recipe): Step[] {
  return recipe.sections.flatMap((section) => section.blocks.filter((block): block is Step => block.kind === "step"));
}

export function meta_text(recipe: Recipe, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = recipe.metadata[key];
    if (typeof value === "string" && value !== "") return value;
    if (Array.isArray(value) && value.length > 0) return value.join(", ");
  }
  return null;
}

export function recipe_title(recipe: Recipe, file_name: string): string {
  return meta_text(recipe, "title") ?? file_name.replace(/\.cook$/i, "");
}

/** `servings: 4`, `serves: 2-3` or `servings: 2|4|8` all start at their first number. */
export function recipe_servings(recipe: Recipe): number | null {
  const text = meta_text(recipe, "servings", "serves", "yield");
  const match = text ? /\d+([.,]\d+)?/.exec(text) : null;
  const value = match ? Number(match[0].replace(",", ".")) : null;
  return value && value > 0 ? value : null;
}

export function recipe_tags(recipe: Recipe): string[] {
  const value = recipe.metadata.tags ?? recipe.metadata.tag;
  const list = Array.isArray(value) ? value : (value ?? "").split(",");
  return [...new Set(list.map((tag) => tag.trim().replace(/^#/, "")).filter((tag) => tag !== ""))];
}
