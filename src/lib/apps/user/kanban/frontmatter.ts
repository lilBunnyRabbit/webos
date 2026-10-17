// Hand-written subset of YAML: top-level scalars and lists only. Nested maps are skipped.
export type FieldValue = string | string[];

export interface Frontmatter {
  fields: Record<string, FieldValue>;
  body: string;
}

interface Block {
  start: number;
  end: number;
  after: number;
}

const FENCE = /^---[ \t]*\r?\n/;
const CLOSE = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m;
const KEY_LINE = /^([^\s#:-][^:]*?)[ \t]*:(?=[ \t]|$)([ \t]*)(.*)$/;

function find_block(text: string): Block | null {
  const open = FENCE.exec(text);
  if (!open) return null;
  const start = open[0].length;
  const close = CLOSE.exec(text.slice(start));
  if (!close) return null;
  return { start, end: start + close.index, after: start + close.index + close[0].length };
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value;
}

function strip_comment(value: string): string {
  if (value.startsWith('"') || value.startsWith("'")) {
    const quote = value[0];
    for (let i = 1; i < value.length; i++) {
      if (quote === '"' && value[i] === "\\") i++;
      else if (value[i] === quote) return value.slice(0, i + 1);
    }
    return value;
  }
  const hash = value.search(/[ \t]#/);
  return (hash < 0 ? value : value.slice(0, hash)).trimEnd();
}

function split_list(inner: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const char of inner) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === ",") {
      items.push(current);
      current = "";
    } else current += char;
  }
  items.push(current);
  return items.map((item) => unquote(item.trim())).filter((item) => item !== "");
}

function parse_value(raw: string): FieldValue {
  const value = strip_comment(raw.trim());
  if (value.startsWith("[") && value.endsWith("]")) return split_list(value.slice(1, -1));
  return unquote(value);
}

const is_continuation = (line: string) => /^[ \t]/.test(line) || /^-(?:[ \t]|$)/.test(line);

export function parse_frontmatter(text: string): Frontmatter {
  const block = find_block(text);
  if (!block) return { fields: {}, body: text };
  const fields: Record<string, FieldValue> = {};
  const lines = text.slice(block.start, block.end).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = KEY_LINE.exec(lines[i]);
    if (!match) continue;
    const key = match[1];
    const inline = match[3].trim();
    if (inline !== "" && !/^[|>]/.test(inline)) {
      fields[key] = parse_value(inline);
      continue;
    }
    const items: string[] = [];
    const text_lines: string[] = [];
    while (i + 1 < lines.length && is_continuation(lines[i + 1])) {
      const line = lines[++i];
      const item = /^[ \t]*-(?:[ \t]+(.*))?$/.exec(line);
      if (item && !inline) items.push(unquote(strip_comment((item[1] ?? "").trim())));
      else text_lines.push(line.trim());
    }
    fields[key] = items.length > 0 ? items.filter((item) => item !== "") : text_lines.join(inline.startsWith(">") ? " " : "\n");
  }
  return { fields, body: text.slice(block.after) };
}

export function field_text(fields: Record<string, FieldValue>, key: string): string {
  const value = fields[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

// Quoted whenever YAML would read the plain text back as something else (a number, a bool, a map).
export function format_scalar(value: string): string {
  if (value === "") return "";
  const plain =
    !/^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(value) &&
    !/:(?:\s|$)|\s#|\s$|[\r\n]/.test(value) &&
    !/^(?:true|false|yes|no|on|off|null|~|[-+]?\d[\d_]*(?:\.\d*)?(?:e[-+]?\d+)?|0x[\da-f]+|\.inf|\.nan)$/i.test(value);
  return plain ? value : JSON.stringify(value);
}

// Rewrites only that key's line (plus a block list under it), so a moved card's diff is one line.
export function set_field(text: string, key: string, value: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const formatted = format_scalar(value);
  const line_for = (prefix: string, space: string) => (formatted === "" ? `${prefix}:` : `${prefix}:${space || " "}${formatted}`);
  const block = find_block(text);
  if (!block) return `---${eol}${line_for(key, " ")}${eol}---${eol}${text}`;

  const head = text.slice(block.start, block.end);
  const lines = head.split(/(?<=\n)/);
  let offset = block.start;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ending = /\r?\n$/.exec(line)?.[0] ?? "";
    const content = line.slice(0, line.length - ending.length);
    const match = KEY_LINE.exec(content);
    if (match && match[1] === key) {
      const inline = match[3].trim();
      const comment = inline.startsWith('"') || inline.startsWith("'") ? "" : inline.slice(strip_comment(inline).length);
      const keep_comment = inline !== "" && !/^[|>]/.test(inline) && !inline.startsWith("[") ? comment : "";
      const prefix = content.slice(0, content.indexOf(":", match[1].length));
      let end = offset + line.length;
      if (inline === "" || /^[|>]/.test(inline)) {
        for (let j = i + 1; j < lines.length && is_continuation(lines[j].replace(/\r?\n$/, "")); j++) end += lines[j].length;
      }
      const replacement = `${line_for(prefix, match[2])}${keep_comment}${ending || (end < block.end ? eol : "")}`;
      return text.slice(0, offset) + replacement + text.slice(end);
    }
    offset += line.length;
  }
  const needs_break = block.end > block.start && !/\n$/.test(head);
  return `${text.slice(0, block.end)}${needs_break ? eol : ""}${line_for(key, " ")}${eol}${text.slice(block.end)}`;
}

export function note_title(fields: Record<string, FieldValue>, body: string, file: string): string {
  const title = field_text(fields, "title").trim();
  if (title) return title;
  const heading = /^#{1,6}[ \t]+(.+?)[ \t#]*$/m.exec(body);
  if (heading) return heading[1].trim();
  return file.replace(/\.md$/i, "");
}

const pad = (value: number) => String(value).padStart(2, "0");

export function format_moment(format: string, date: Date): string {
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => tokens[token]);
}

// Obsidian core template variables, with moment-style formats.
export function fill_template(template: string, title: string, now = new Date()): string {
  return template.replace(/\{\{\s*(title|date|time)\s*(?::([^}]*))?\}\}/g, (_, name: string, format?: string) => {
    if (name === "title") return title;
    return format_moment(format?.trim() || (name === "date" ? "YYYY-MM-DD" : "HH:mm"), now);
  });
}

export function file_name_for(title: string, taken: Set<string>): string {
  const slug =
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "untitled";
  let name = `${slug}.md`;
  for (let n = 2; taken.has(name); n++) name = `${slug}-${n}.md`;
  return name;
}
