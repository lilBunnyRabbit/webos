import { VARIABLES_BY_NAME, ValueType } from "./builtins";
import { AMMO, type Value } from "./simulator";

export interface Step {
  at: number;
  name: string;
  value: Value;
}

export interface ScriptError {
  line: number;
  message: string;
}

export interface Script {
  steps: Step[];
  errors: ScriptError[];
}

const LINE = /^(\d+(?:\.\d+)?)\s*s?\s+([A-Za-z_]\w*)\s*=\s*(.+)$/;

function value_of(name: string, raw: string): { value: Value } | { error: string } {
  const text = raw.trim();
  const type = name === AMMO ? ValueType.NUMBER : VARIABLES_BY_NAME.get(name)?.type;
  if (type === ValueType.STRING) return { value: /^".*"$/.test(text) ? text.slice(1, -1) : text };
  if (/^(on|true)$/i.test(text)) return { value: 1 };
  if (/^(off|false)$/i.test(text)) return { value: type === ValueType.BOOL ? -1 : 0 };
  const number = Number(text);
  return Number.isFinite(number) ? { value: number } : { error: `"${text}" isn't a number, on or off` };
}

export function parse_script(text: string): Script {
  const steps: Step[] = [];
  const errors: ScriptError[] = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line) return;
    const match = LINE.exec(line);
    if (!match) {
      errors.push({ line: index + 1, message: "Write a step as: 2s Pitch = 1" });
      return;
    }
    const [, at, name, raw_value] = match;
    if (name !== AMMO && !VARIABLES_BY_NAME.has(name)) {
      errors.push({ line: index + 1, message: `${name} isn't a built-in variable` });
      return;
    }
    if (name === "Time") {
      errors.push({ line: index + 1, message: "Time is the simulator's clock" });
      return;
    }
    const parsed = value_of(name, raw_value);
    if ("error" in parsed) errors.push({ line: index + 1, message: parsed.error });
    else steps.push({ at: Number(at), name, value: parsed.value });
  });
  steps.sort((a, b) => a.at - b.at);
  return { steps, errors };
}

/** Half-open (from, to], so a step is never skipped or run twice whatever the tick size. Start with from = -1. */
export function apply_due(steps: readonly Step[], from: number, to: number, world: Record<string, Value>): boolean {
  let changed = false;
  for (const step of steps) {
    if (step.at > from && step.at <= to) {
      world[step.name] = step.value;
      changed = true;
    }
  }
  return changed;
}
