import { each_node, type Expr } from "./ast";
import { FUNCTIONS_BY_NAME, VARIABLES_BY_NAME } from "./builtins";
import { format_dsl } from "./emit";
import { is_ident_part, is_ident_start, KEYWORDS } from "./lexer";
import { parse_expression } from "./parser";

export interface CraftSetter {
  variable: string;
  function: string;
  priority: number;
  activator: string | null;
}

export interface PartInput {
  part_id: string;
  part_type: string;
  element: string;
  attribute: string;
  value: string;
}

export interface PartWriter {
  variable: string;
  part_id: string;
  part_type: string;
}

export interface Craft {
  name: string;
  setters: CraftSetter[];
  inputs: PartInput[];
  writers: PartWriter[];
}

const TAG = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*\/?>/g;
const ATTRIBUTE = /([\w.:-]+)\s*=\s*"([^"]*)"/g;
const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

const unescape = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code: string) => {
    if (code[0] === "#") return String.fromCodePoint(code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
    return ENTITIES[code] ?? match;
  });

function attributes(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, key, value] of text.matchAll(ATTRIBUTE)) found[key] = unescape(value);
  return found;
}

const INPUT_ATTRIBUTES = ["input", "inputId", "faceInput", "activationGroup"];
const WRITER_ELEMENTS = new Set(["Button.State", "Switch.State"]);
const is_unset = (value: string) => !value.trim() || /^(disabled|none)$/i.test(value.trim());

/** Reads a SimplePlanes aircraft save with a tag scanner rather than DOMParser, so it runs in workers and tests alike. */
export function read_craft(xml: string): Craft {
  const craft: Craft = { name: "", setters: [], inputs: [], writers: [] };
  let found = false;
  let part: { id: string; type: string } | null = null;

  for (const [, closing, element, raw] of xml.matchAll(TAG)) {
    if (closing) {
      if (element === "Part") part = null;
      continue;
    }
    const attrs = attributes(raw);
    if (element === "Aircraft") {
      found = true;
      craft.name = attrs.name ?? "";
    } else if (element === "Part") {
      part = { id: attrs.id ?? "?", type: attrs.partType ?? "Part" };
    } else if (element === "Setter") {
      craft.setters.push({
        variable: attrs.variable ?? "",
        function: attrs.function ?? "",
        priority: Number(attrs.priority ?? 0) || 0,
        activator: attrs.activator ?? null,
      });
    } else if (part && element === "VariableOutput" && attrs.variable) {
      craft.writers.push({ variable: attrs.variable.trim(), part_id: part.id, part_type: part.type });
    } else if (part) {
      for (const attribute of INPUT_ATTRIBUTES) {
        const value = attrs[attribute];
        if (value === undefined || is_unset(value)) continue;
        if (attribute === "activationGroup" && /^-?\d+$/.test(value.trim())) continue;
        if (attribute === "inputId" && WRITER_ELEMENTS.has(element)) {
          craft.writers.push({ variable: value.trim(), part_id: part.id, part_type: part.type });
          continue;
        }
        craft.inputs.push({ part_id: part.id, part_type: part.type, element, attribute, value });
      }
    }
  }
  if (!found) throw new Error("This isn't a SimplePlanes craft: there's no <Aircraft> element");
  return craft;
}

export interface Decompiled {
  source: string;
  notes: string[];
}

function identifier(name: string, taken: Set<string>): string {
  let base = [...name].map((char) => (is_ident_part(char) ? char : "_")).join("") || "value";
  if (!is_ident_start(base[0])) base = `v_${base}`;
  if (KEYWORDS.has(base) || VARIABLES_BY_NAME.has(base)) base = `${base}_value`;
  let candidate = base;
  for (let index = 2; taken.has(candidate); index++) candidate = `${base}_${index}`;
  taken.add(candidate);
  return candidate;
}

function rename(expr: Expr, map: (name: string) => Expr | null): Expr {
  switch (expr.kind) {
    case "ident":
      return map(expr.name) ?? expr;
    case "unary":
      return { ...expr, arg: rename(expr.arg, map) };
    case "binary":
      return { ...expr, left: rename(expr.left, map), right: rename(expr.right, map) };
    case "ternary":
      return { ...expr, cond: rename(expr.cond, map), then: rename(expr.then, map), otherwise: rename(expr.otherwise, map) };
    case "call":
      return { ...expr, args: expr.args.map((arg) => rename(arg, map)) };
    default:
      return expr;
  }
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "part";

/**
 * Setters run top to bottom and the last write wins, so a variable set several times becomes a chain of vars: each
 * setter reads the latest write above it, or last tick's final value (`@prev`) before the first one.
 */
export function decompile(craft: Craft): Decompiled {
  const notes: string[] = [];
  const lines: string[] = [];
  const taken = new Set<string>();
  const counts = new Map<string, number>();
  for (const setter of craft.setters) counts.set(setter.variable, (counts.get(setter.variable) ?? 0) + 1);

  const final = new Map<string, string>();
  for (const variable of counts.keys()) {
    const name = identifier(variable, taken);
    final.set(variable, name);
    if (name !== variable) notes.push(`"${variable}" is written ${name}: the DSL needs a plain name.`);
  }

  const written = new Map<string, string>();
  const seen = new Map<string, number>();
  const read_now = (name: string): Expr | null => {
    const latest = written.get(name);
    if (latest) return { kind: "ident", name: latest, span: { from: 0, to: 0 } };
    const last = final.get(name);
    return last ? { kind: "prev", name: last, span: { from: 0, to: 0 } } : null;
  };

  lines.push(`// Decompiled from "${craft.name || "craft"}": ${craft.setters.length} setters, ${craft.inputs.length} part inputs.`);
  for (const setter of craft.setters) {
    const count = counts.get(setter.variable)!;
    const index = (seen.get(setter.variable) ?? 0) + 1;
    seen.set(setter.variable, index);
    const parsed = parse_expression(setter.function);
    if (!parsed.expr || parsed.diagnostics.length) {
      notes.push(`Setter ${setter.variable} = ${setter.function.trim()} couldn't be read: ${parsed.diagnostics[0]?.message ?? "unknown syntax"}. It was left out.`);
      continue;
    }
    if (setter.priority !== 0) notes.push(`Setter ${setter.variable} has priority ${setter.priority}; the DSL orders setters itself, so it was dropped.`);
    if (setter.activator) notes.push(`Setter ${setter.variable} has an activator (${setter.activator}); the DSL can't express one yet, so it was dropped.`);
    const expr = rename(parsed.expr, read_now);
    const name = index === count ? final.get(setter.variable)! : identifier(`${final.get(setter.variable)}_${index}`, taken);
    lines.push(`var ${name} = ${format_dsl(expr)}`);
    written.set(setter.variable, name);
  }
  for (const [variable, count] of counts) {
    if (count > 1) notes.push(`${variable} is set ${count} times; each earlier setter became its own var, and the last one keeps the name.`);
  }

  const read_final = (name: string): Expr | null => {
    const last = final.get(name);
    return last ? { kind: "ident", name: last, span: { from: 0, to: 0 } } : null;
  };
  const per_part = new Map<string, number>();
  for (const input of craft.inputs) per_part.set(input.part_id, (per_part.get(input.part_id) ?? 0) + 1);
  const outputs: string[] = [];
  for (const input of craft.inputs) {
    const parsed = parse_expression(input.value);
    if (!parsed.expr || parsed.diagnostics.length) {
      notes.push(`Part ${input.part_id} ${input.attribute} = ${input.value.trim()} couldn't be read, so it was left out.`);
      continue;
    }
    if (parsed.expr.kind === "ident" && VARIABLES_BY_NAME.has(parsed.expr.name)) continue;
    const suffix = per_part.get(input.part_id)! > 1 ? `_${slug(input.attribute)}` : "";
    const name = identifier(`${slug(input.part_type)}_${input.part_id}${suffix}`, taken);
    outputs.push(`output ${name} = ${format_dsl(rename(parsed.expr, read_final))}`);
  }
  if (outputs.length) lines.push("", "// Part inputs: paste each into the part's input field.", ...outputs);

  const read = new Set<string>();
  const collect = (text: string) => {
    const parsed = parse_expression(text).expr;
    if (parsed) each_node(parsed, (node) => node.kind === "ident" && read.add(node.name));
  };
  craft.setters.forEach((setter) => collect(setter.function));
  craft.inputs.forEach((input) => collect(input.value));
  const external = craft.writers.filter((writer) => read.has(writer.variable) && !final.has(writer.variable) && !VARIABLES_BY_NAME.has(writer.variable));
  for (const writer of external) {
    notes.push(`${writer.variable} is set by part ${writer.part_id} (${writer.part_type}). The DSL can't declare a part-set variable yet, so it shows as unknown.`);
  }
  const writers = new Set(craft.writers.map((writer) => writer.variable));
  const unset = [...read].filter((name) => !final.has(name) && !writers.has(name) && !VARIABLES_BY_NAME.has(name) && !FUNCTIONS_BY_NAME.has(name));
  for (const name of unset) notes.push(`${name} is read but nothing in the craft sets it, so the game reads 0.`);
  if (external.length) lines.splice(1, 0, `// Set by parts, not setters: ${[...new Set(external.map((writer) => writer.variable))].join(", ")}`);

  return { source: `${lines.join("\n")}\n`, notes };
}
