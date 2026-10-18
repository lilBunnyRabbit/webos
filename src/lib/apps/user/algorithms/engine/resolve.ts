import type { Definition } from "./definition";
import { InputError } from "./inputs";

export interface Resolved {
  value: unknown;
  error: string | null;
}

export function resolve_input(definition: Definition, raw: unknown): Resolved {
  const sample = { value: definition.input.sample, error: null };
  if (raw === undefined || raw === null) return sample;
  if (typeof raw === "string" || typeof raw === "number") {
    const direct = definition.input.schema.safeParse(raw);
    if (direct.success) return { value: direct.data, error: null };
    try {
      return { value: definition.input.parse(String(raw)), error: null };
    } catch (reason) {
      return { ...sample, error: reason instanceof InputError ? reason.message : "The input couldn't be read." };
    }
  }
  const parsed = definition.input.schema.safeParse(raw);
  return parsed.success ? { value: parsed.data, error: null } : { ...sample, error: parsed.error.issues[0]?.message ?? "The input couldn't be read." };
}
