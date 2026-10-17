import { name_problem } from "$lib/core/components/files/name-rules";
import { base_name, file_stem, parent_path } from "./path";

/** `pattern` runs first (tokens, or `/regex/replacement/flags` on the whole name), then find and replace on its result. */
export interface RenameRule {
  pattern: string;
  find?: string;
  replace?: string;
  match_case?: boolean;
  start?: number;
  step?: number;
}

export interface RenameSource {
  path: string;
  /** Milliseconds; `null` for a folder, which then can't use `{date}`. */
  modified: number | null;
}

export interface RenameStep {
  path: string;
  name: string;
  new_name: string;
  problem: string | null;
}

export interface RenamePlan {
  steps: RenameStep[];
  error: string | null;
  changed: number;
  blocked: boolean;
}

export class PatternError extends Error {}

const CASES = {
  lower: (text: string) => text.toLowerCase(),
  upper: (text: string) => text.toUpperCase(),
  title: (text: string) => text.toLowerCase().replace(/(^|[\s_-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase()),
} as const;

const DATE_PARTS: Record<string, (date: Date) => string> = {
  yyyy: (date) => String(date.getFullYear()),
  yy: (date) => String(date.getFullYear() % 100).padStart(2, "0"),
  MM: (date) => String(date.getMonth() + 1).padStart(2, "0"),
  dd: (date) => String(date.getDate()).padStart(2, "0"),
  HH: (date) => String(date.getHours()).padStart(2, "0"),
  mm: (date) => String(date.getMinutes()).padStart(2, "0"),
  ss: (date) => String(date.getSeconds()).padStart(2, "0"),
};

const NO_DATE = Symbol("no date");

interface TokenInput {
  name: string;
  ext: string;
  parent: string;
  n: number;
  modified: number | null;
}

type Token = (input: TokenInput) => string | typeof NO_DATE;

function compile_token(body: string): Token {
  const [key, option, ...rest] = body.split(":");
  if (rest.length > 0) throw new PatternError(`Unknown token {${body}}`);

  if (key === "name" || key === "ext" || key === "parent") {
    if (option === undefined) return (input) => input[key];
    if (!(option in CASES)) throw new PatternError(`{${key}:${option}}: use lower, upper or title`);
    const change = CASES[option as keyof typeof CASES];
    return (input) => change(input[key]);
  }

  if (key === "n") {
    if (option === undefined) return (input) => String(input.n);
    const width = Number(option);
    if (!Number.isInteger(width) || width < 1 || width > 12) throw new PatternError(`{n:${option}}: the width is a number from 1 to 12`);
    return (input) => (input.n < 0 ? "-" + String(-input.n).padStart(width, "0") : String(input.n).padStart(width, "0"));
  }

  if (key === "date") {
    const format = option ?? "yyyy-MM-dd";
    return (input) => (input.modified === null ? NO_DATE : format_date(new Date(input.modified), format));
  }

  throw new PatternError(`Unknown token {${body}}`);
}

function format_date(date: Date, format: string): string {
  return format.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, (part) => DATE_PARTS[part](date));
}

type Template = (input: TokenInput, escape: (text: string) => string) => string | typeof NO_DATE;

function compile_template(template: string): Template {
  const parts: (string | Token)[] = [];
  let last = 0;
  for (const match of template.matchAll(/\{\{|\}\}|\{([^{}]*)\}/g)) {
    parts.push(template.slice(last, match.index));
    parts.push(match[0] === "{{" ? "{" : match[0] === "}}" ? "}" : compile_token(match[1]));
    last = match.index + match[0].length;
  }
  parts.push(template.slice(last));

  return (input, escape) => {
    let out = "";
    for (const part of parts) {
      if (typeof part === "string") {
        out += part;
        continue;
      }
      const value = part(input);
      if (value === NO_DATE) return NO_DATE;
      out += escape(value);
    }
    return out;
  };
}

const REGEX_FORM = /^\/((?:\\.|[^\\/])*)\/((?:\\.|[^\\/])*)\/([a-z]*)$/;

const escape_regex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const keep = (text: string) => text;

type Rename = (source: RenameSource, index: number) => string | typeof NO_DATE;

export function compile_rule(rule: RenameRule): Rename {
  const start = rule.start ?? 1;
  const step = rule.step ?? 1;
  const pattern = rule.pattern === "" ? "{name}{ext}" : rule.pattern;

  let base: (input: TokenInput) => string | typeof NO_DATE;
  if (pattern.startsWith("/")) {
    const parts = REGEX_FORM.exec(pattern);
    if (!parts) throw new PatternError("A regex looks like /find/replace/flags");
    let regex: RegExp;
    try {
      regex = new RegExp(parts[1], parts[3]);
    } catch (error) {
      throw new PatternError(`Invalid regex: ${error instanceof Error ? error.message : String(error)}`);
    }
    const replacement = compile_template(parts[2].replace(/\\\//g, "/"));
    base = (input) => {
      // Token values are literal text, so a `$` in a folder name can't turn into a group reference.
      const expanded = replacement(input, (text) => text.replaceAll("$", "$$$$"));
      return expanded === NO_DATE ? NO_DATE : (input.name + input.ext).replace(regex, expanded);
    };
  } else {
    const template = compile_template(pattern);
    base = (input) => template(input, keep);
  }

  const find = rule.find ?? "";
  const replace = rule.replace ?? "";
  const finder = find === "" ? null : new RegExp(escape_regex(find), rule.match_case ? "g" : "gi");

  return (source, index) => {
    const name = base_name(source.path);
    const stem = file_stem(name);
    const folder = parent_path(source.path);
    const input = { name: stem, ext: name.slice(stem.length), parent: folder === "/" ? "" : base_name(folder), n: start + index * step, modified: source.modified };
    const result = base(input);
    if (result === NO_DATE || !finder) return result;
    return result.replace(finder, () => replace);
  };
}

/** Entries renamed in the same batch free their names, so swaps plan fine; only names that stay put clash. */
export function plan_renames(sources: RenameSource[], rule: RenameRule, siblings: Map<string, string[]>): RenamePlan {
  const unique = [...new Map(sources.map((source) => [source.path, source])).values()];
  let rename: Rename;
  try {
    rename = compile_rule(rule);
  } catch (error) {
    if (!(error instanceof PatternError)) throw error;
    const steps = unique.map((source) => ({ path: source.path, name: base_name(source.path), new_name: base_name(source.path), problem: null }));
    return { steps, error: error.message, changed: 0, blocked: true };
  }

  const steps: RenameStep[] = unique.map((source, index) => {
    const name = base_name(source.path);
    const result = rename(source, index);
    if (result === NO_DATE) return { path: source.path, name, new_name: name, problem: "Folders have no modified date." };
    const problem = result.trim() === "" ? "The new name is empty." : name_problem(result, []);
    return { path: source.path, name, new_name: result, problem };
  });

  const moving = new Set(unique.map((source) => source.path));
  const claims = new Map<string, number>();
  for (const step of steps) {
    const key = `${parent_path(step.path)}\0${step.new_name}`;
    claims.set(key, (claims.get(key) ?? 0) + 1);
  }

  for (const step of steps) {
    if (step.problem) continue;
    const folder = parent_path(step.path);
    const kept =
      step.new_name !== step.name &&
      (siblings.get(folder) ?? []).some((name) => name === step.new_name && !moving.has(folder === "/" ? `/${name}` : `${folder}/${name}`));
    if (kept) step.problem = "Something here already has that name.";
    else if ((claims.get(`${folder}\0${step.new_name}`) ?? 0) > 1) step.problem = "Another item gets the same name.";
  }

  return {
    steps,
    error: null,
    changed: steps.filter((step) => step.new_name !== step.name).length,
    blocked: steps.some((step) => step.problem !== null),
  };
}
