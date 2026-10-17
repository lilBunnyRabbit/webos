export const FieldKind = { CHECK: "check", INPUT: "input", AREA: "area", NOTE: "note" } as const;
export type FieldKind = (typeof FieldKind)[keyof typeof FieldKind];

export interface CheckField {
  kind: typeof FieldKind.CHECK;
  /** The label, numbered when it repeats: answers are stored under it, so they survive reordering the form. */
  key: string;
  label: string;
  note: string | null;
}

export interface TextField {
  kind: typeof FieldKind.INPUT | typeof FieldKind.AREA;
  key: string;
  label: string;
  placeholder: string | null;
}

export interface NoteField {
  kind: typeof FieldKind.NOTE;
  content: string;
}

export type Field = CheckField | TextField | NoteField;
export type Question = CheckField | TextField;
export type Answer = string | boolean;

export interface Form {
  title: string;
  fields: Field[];
}

export const UNTITLED = "Untitled form";

const TITLE = /^#\s+(.+)$/;
const AREA = /^\s*[-*]\s+\[\.\.\.\]\s+(.*)$/;
const INPUT = /^\s*[-*]\s+\[_+\]\s+(.*)$/;
const CHECK = /^\s*[-*]\s+\[[ xX]?\]\s+(.*)$/;

function split_meta(text: string): { main: string; meta: string | null } {
  const at = text.indexOf(" | ");
  if (at === -1) return { main: text.trim(), meta: null };
  return { main: text.slice(0, at).trim(), meta: text.slice(at + 3).trim() || null };
}

/** formlink's syntax: `[x]` and `[]` read as `[ ]` too, and any run of underscores is `[_]`. */
export function parse_form(source: string): Form {
  const fields: Field[] = [];
  const seen = new Map<string, number>();
  let title = "";
  let note: string[] = [];

  const flush = () => {
    const content = note.join("\n").trim();
    if (content) fields.push({ kind: FieldKind.NOTE, content });
    note = [];
  };
  const key_for = (label: string) => {
    const base = label || "Question";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  };

  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = title ? null : TITLE.exec(line);
    if (heading) {
      title = heading[1].trim();
      continue;
    }

    const area = AREA.exec(line);
    const input = area ? null : INPUT.exec(line);
    const check = area || input ? null : CHECK.exec(line);
    const match = area ?? input ?? check;
    if (!match) {
      note.push(line);
      continue;
    }

    flush();
    const { main, meta } = split_meta(match[1]);
    if (check) fields.push({ kind: FieldKind.CHECK, key: key_for(main), label: main, note: meta });
    else fields.push({ kind: area ? FieldKind.AREA : FieldKind.INPUT, key: key_for(main), label: main, placeholder: meta });
  }
  flush();

  return { title: title || UNTITLED, fields };
}

export function questions(form: Form): Question[] {
  return form.fields.filter((field): field is Question => field.kind !== FieldKind.NOTE);
}

export function blank_answers(form: Form): Record<string, Answer> {
  return Object.fromEntries(questions(form).map((field) => [field.key, field.kind === FieldKind.CHECK ? false : ""]));
}

export const EXAMPLE = `# Design changes: pick what to build

A few candidate tweaks. Tick the ones worth doing, add notes where useful.

## Layout
- [ ] Round the card corners | 8px radius
- [ ] Darker sticky header
- [ ] Wider content column on desktop

## Copy
- [ ] Rewrite the empty-state text
- [_] Alternative headline you'd suggest | leave blank to keep the current one

## Open
- [...] Anything else you'd change first? | priority order is fine
`;

export const AI_PROMPT = `Write a form in this markdown syntax (output ONLY the markdown, no fences, no commentary):

# Form Title

Optional intro paragraph. Any normal markdown (headings, paragraphs, lists) is shown as-is.

- [ ] A checkbox the recipient can tick
- [ ] Another checkbox | optional sub-note after a pipe
- [_] A short text question | optional placeholder
- [...] A long / multi-line text question | optional placeholder

Rules:
- First "# " heading is the form title.
- "- [ ]" = checkbox, "- [_]" = single-line input, "- [...]" = multi-line input.
- Add " | text" at the end of a line for a placeholder (inputs) or sub-note (checkboxes).
- Everything else is rendered as markdown notes.

Now write the form for: <DESCRIBE YOUR FORM HERE>`;
