import { parse_cook, recipe_tags, steps, type Amount, type MetaValue, type StepItem } from "./cooklang";

export interface FormIngredient {
  id: string;
  amount: string;
  unit: string;
  name: string;
  fixed: boolean;
}

export interface FormStep {
  id: string;
  text: string;
}

export interface RecipeForm {
  title: string;
  servings: string;
  tags: string[];
  source: string;
  ingredients: FormIngredient[];
  steps: FormStep[];
  extra: Record<string, MetaValue>;
}

const OWNED_KEYS = new Set(["title", "servings", "serves", "tags", "tag", "source"]);
const UNICODE_FRACTIONS: Record<string, string> = { "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };
const WORD_CHAR = "[\\p{L}\\p{N}_]";
const NEEDS_LEAD = /^You'll need /;

let next_id = 0;
export function row_id(): string {
  next_id += 1;
  return `row-${next_id}`;
}

export function empty_ingredient(): FormIngredient {
  return { id: row_id(), amount: "", unit: "", name: "", fixed: false };
}

export function empty_step(): FormStep {
  return { id: row_id(), text: "" };
}

export function empty_form(): RecipeForm {
  return { title: "", servings: "", tags: [], source: "", ingredients: [empty_ingredient()], steps: [empty_step()], extra: {} };
}

export function normalize_quantity(text: string): string {
  return text
    .replace(/(\d)\s*([½⅓⅔¼¾⅕⅛⅜⅝⅞])/g, (_, whole: string, fraction: string) => `${whole} ${UNICODE_FRACTIONS[fraction]}`)
    .replace(/[½⅓⅔¼¾⅕⅛⅜⅝⅞]/g, (fraction) => UNICODE_FRACTIONS[fraction])
    .replace(/⁄/g, "/")
    .trim();
}

interface SplitName {
  name: string;
  note: string;
  optional: boolean;
}

export function split_name(raw: string): SplitName {
  let name = raw.replace(/[@#~{}]/g, "").trim();
  const optional = /\s*\(optional\)\s*$/i.test(name);
  if (optional) name = name.replace(/\s*\(optional\)\s*$/i, "");
  const comma = name.indexOf(",");
  const note = comma >= 0 ? name.slice(comma + 1).trim() : "";
  if (comma >= 0) name = name.slice(0, comma).trim();
  return { name, note: note.replace(/[()]/g, ""), optional };
}

function join_name(name: string, note: string, optional: boolean): string {
  return `${name}${note ? `, ${note}` : ""}${optional ? " (optional)" : ""}`;
}

function amount_source(row: FormIngredient): string {
  const quantity = normalize_quantity(row.amount).replace(/[{}%]/g, "");
  const unit = row.unit.replace(/[{}%]/g, "").trim();
  const text = `${row.fixed && quantity ? "=" : ""}${quantity}`;
  return unit ? `${text}%${unit}` : text;
}

function marker(row: FormIngredient, word: string): string {
  const { note, optional } = split_name(row.name);
  return `@${optional ? "?" : ""}${word}{${amount_source(row)}}${note ? `(${note})` : ""}`;
}

function escape_regex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Segment = { kind: "text"; text: string } | { kind: "kept"; text: string };

// A timer or cookware kept from the file, or Cooklang typed into a step, is never linked into.
function segments(text: string): Segment[] {
  const out: Segment[] = [];
  const pattern = /[@#~]\??[^@#~{}\n]*\{[^}]*\}(\([^)]*\))?/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) out.push({ kind: "text", text: text.slice(last, match.index) });
    out.push({ kind: "kept", text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

// Longest names first, so "peanut butter" is claimed before "butter" can split it.
export function link_steps(step_texts: string[], rows: FormIngredient[]): { steps: string[]; unlinked: FormIngredient[] } {
  const parts = step_texts.map(segments);
  const named = rows.filter((row) => split_name(row.name).name !== "");
  const groups = new Map<string, FormIngredient[]>();
  for (const row of named) {
    const key = split_name(row.name).name.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const linked = new Set<FormIngredient>();
  for (const [key, group] of [...groups].sort((a, b) => b[0].length - a[0].length)) {
    const pattern = new RegExp(`(?<!${WORD_CHAR})${escape_regex(key)}(?!${WORD_CHAR})`, "iu");
    let index = 0;
    for (const step of parts) {
      for (let position = 0; position < step.length && index < group.length; position++) {
        const segment = step[position];
        if (segment.kind !== "text") continue;
        const match = pattern.exec(segment.text);
        if (!match) continue;
        const row = group[index++];
        linked.add(row);
        const before = segment.text.slice(0, match.index);
        const after = segment.text.slice(match.index + match[0].length);
        const replacement: Segment[] = [{ kind: "kept", text: marker(row, match[0]) }];
        if (before) replacement.unshift({ kind: "text", text: before });
        if (after) replacement.push({ kind: "text", text: after });
        step.splice(position, 1, ...replacement);
        position += before ? 1 : 0;
      }
    }
  }
  return {
    steps: parts.map((step) => step.map((segment) => segment.text).join("")),
    unlinked: named.filter((row) => !linked.has(row)),
  };
}

function needs_step(rows: FormIngredient[]): string {
  const marks = rows.map((row) => marker(row, split_name(row.name).name));
  const list = marks.length === 1 ? marks[0] : `${marks.slice(0, -1).join(", ")} and ${marks.at(-1)}`;
  return `You'll need ${list}.`;
}

function meta_line(key: string, value: MetaValue): string[] {
  if (!Array.isArray(value)) return [`${key}: ${value.replace(/\n/g, " ")}`];
  if (value.some((item) => item.includes(","))) return [`${key}:`, ...value.map((item) => `  - ${item}`)];
  return [`${key}: [${value.join(", ")}]`];
}

function step_source(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" \\\n");
}

export function form_to_cook(form: RecipeForm): string {
  const metadata: [string, MetaValue][] = [];
  if (form.title.trim()) metadata.push(["title", form.title.trim()]);
  if (form.servings.trim()) metadata.push(["servings", form.servings.trim()]);
  const tags = form.tags.map((tag) => tag.trim().replace(/,/g, "")).filter((tag) => tag !== "");
  if (tags.length > 0) metadata.push(["tags", tags]);
  if (form.source.trim()) metadata.push(["source", form.source.trim()]);
  for (const [key, value] of Object.entries(form.extra)) if (!OWNED_KEYS.has(key)) metadata.push([key, value]);

  const texts = form.steps.map((step) => step_source(step.text)).filter((text) => text !== "");
  const { steps: linked, unlinked } = link_steps(texts, form.ingredients);
  const body = unlinked.length > 0 ? [needs_step(unlinked), ...linked] : linked;

  const head = metadata.length > 0 ? ["---", ...metadata.flatMap(([key, value]) => meta_line(key, value)), "---", ""] : [];
  return [...head, ...body.flatMap((text) => [text, ""])].join("\n");
}

function item_source(item: StepItem): string {
  if (item.kind === "text") return item.value;
  if (item.kind === "ingredient") return item.name;
  const amount = item.amount ? `${item.amount.fixed ? "=" : ""}${item.amount.text}${item.amount.unit ? `%${item.amount.unit}` : ""}` : "";
  return `${item.kind === "cookware" ? "#" : "~"}${item.name}{${amount}}`;
}

function is_needs_step(items: StepItem[]): boolean {
  if (items[0]?.kind !== "text" || !NEEDS_LEAD.test(items[0].value)) return false;
  const rest = [{ ...items[0], value: items[0].value.replace(NEEDS_LEAD, "") }, ...items.slice(1)];
  return rest.every((item) => item.kind === "ingredient" || (item.kind === "text" && /^(|, | and |\.)$/.test(item.value)));
}

function amount_fields(amount: Amount | null): Pick<FormIngredient, "amount" | "unit" | "fixed"> {
  return { amount: amount?.text ?? "", unit: amount?.unit ?? "", fixed: amount?.fixed ?? false };
}

export function form_from_cook(source: string): RecipeForm {
  const recipe = parse_cook(source);
  const all = steps(recipe);
  const ingredients: FormIngredient[] = [];
  const step_rows: FormStep[] = [];
  all.forEach((step, index) => {
    for (const item of step.items)
      if (item.kind === "ingredient") ingredients.push({ id: row_id(), name: join_name(item.reference ?? item.name, item.note, item.optional), ...amount_fields(item.amount) });
    if (index === 0 && is_needs_step(step.items)) return;
    step_rows.push({ id: row_id(), text: step.items.map(item_source).join("") });
  });
  const text = (key: string) => {
    const value = recipe.metadata[key];
    return typeof value === "string" ? value : "";
  };
  const extra: Record<string, MetaValue> = {};
  for (const [key, value] of Object.entries(recipe.metadata)) if (!OWNED_KEYS.has(key)) extra[key] = value;
  return {
    title: text("title"),
    servings: text("servings") || text("serves"),
    tags: recipe_tags(recipe),
    source: text("source"),
    ingredients: ingredients.length > 0 ? ingredients : [empty_ingredient()],
    steps: step_rows.length > 0 ? step_rows : [empty_step()],
    extra,
  };
}

export const FormIssue = {
  SECTIONS: "sections",
  NOTES: "notes",
  COMMENTS: "comments",
  REFERENCES: "references",
  MOVED: "moved",
} as const;
export type FormIssue = (typeof FormIssue)[keyof typeof FormIssue];

function body_of(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return lines.join("\n");
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return end > 0 ? lines.slice(end + 1).join("\n") : lines.join("\n");
}

export function form_issues(source: string): FormIssue[] {
  const recipe = parse_cook(source);
  const issues: FormIssue[] = [];
  if (recipe.sections.some((section) => section.name !== null)) issues.push(FormIssue.SECTIONS);
  if (recipe.sections.some((section) => section.blocks.some((block) => block.kind === "note"))) issues.push(FormIssue.NOTES);
  if (/--|\[-/.test(body_of(source))) issues.push(FormIssue.COMMENTS);
  const items = steps(recipe).flatMap((step) => step.items);
  if (items.some((item) => item.kind === "ingredient" && item.reference !== null)) issues.push(FormIssue.REFERENCES);
  if (issues.length > 0) return issues;
  const again = steps(parse_cook(form_to_cook(form_from_cook(source))));
  const strip = (list: typeof again) => JSON.stringify(list.map((step) => step.items));
  if (strip(again) !== strip(steps(recipe))) issues.push(FormIssue.MOVED);
  return issues;
}

// Touches one line only: the heart must not rewrite a hand-made file the way the form does.
export function with_favorite(source: string, on: boolean): string {
  return set_meta(set_meta(source, "favourite", null), "favorite", on ? "true" : null);
}

export function set_meta(source: string, key: string, value: string | null): string {
  const lines = source.split("\n");
  const has_front = lines[0]?.trim() === "---";
  const end = has_front ? lines.findIndex((line, index) => index > 0 && line.trim() === "---") : -1;
  if (end < 0) return value === null ? source : ["---", `${key}: ${value}`, "---", source].join("\n");
  const pattern = new RegExp(`^${escape_regex(key)}\\s*:`, "i");
  const found = lines.findIndex((line, index) => index > 0 && index < end && pattern.test(line));
  if (found >= 0) {
    let stop = found + 1;
    while (stop < end && /^\s+-\s/.test(lines[stop])) stop++;
    lines.splice(found, stop - found, ...(value === null ? [] : [`${key}: ${value}`]));
  } else if (value !== null) {
    lines.splice(end, 0, `${key}: ${value}`);
  }
  return lines.join("\n");
}
