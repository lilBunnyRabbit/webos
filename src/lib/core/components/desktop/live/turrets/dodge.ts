import { z } from "zod";
import { PATHS } from "$lib/core/api/services/files/hierarchy";

export const DODGE_PATH = `${PATHS.var_lib}/desktop/pew.json`;
const RECORD_VERSION = 1;
/** One frame's step at most, so a stalled frame can't add time nobody dodged. */
export const MAX_STEP_MS = 100;

const record_schema = z.object({
  version: z.literal(RECORD_VERSION),
  best_ms: z.number().min(0),
  at: z.number(),
});

export interface DodgeRecord {
  best_ms: number;
  at: number;
}

export interface DodgeStep {
  dt_ms: number;
  running: boolean;
  hits: number;
}

export function advance(elapsed: number, step: DodgeStep): number {
  if (step.hits > 0) return 0;
  if (!step.running) return elapsed;
  return elapsed + Math.min(Math.max(step.dt_ms, 0), MAX_STEP_MS);
}

export function parse_record(text: string | null): DodgeRecord | null {
  if (text === null) return null;
  try {
    const result = record_schema.safeParse(JSON.parse(text));
    return result.success ? { best_ms: result.data.best_ms, at: result.data.at } : null;
  } catch {
    return null;
  }
}

export function serialize_record(record: DodgeRecord): string {
  return JSON.stringify({ version: RECORD_VERSION, best_ms: Math.round(record.best_ms), at: record.at }, null, 2);
}

export function format_dodge(ms: number): string {
  const tenths = Math.floor(Math.max(ms, 0) / 100);
  const fraction = tenths % 10;
  const seconds = Math.floor(tenths / 10) % 60;
  const minutes = Math.floor(tenths / 600) % 60;
  const hours = Math.floor(tenths / 36000);
  const two = (value: number) => String(value).padStart(2, "0");
  if (hours > 0) return `${hours}:${two(minutes)}:${two(seconds)}.${fraction}`;
  if (minutes > 0) return `${minutes}:${two(seconds)}.${fraction}`;
  return `${seconds}.${fraction}`;
}
