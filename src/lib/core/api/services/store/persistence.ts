import { z } from "zod";
import { PATHS } from "../files/hierarchy";
import type { AppId } from "../apps/type";

export const STORE_STATE_PATH = `${PATHS.var_lib}/store/state.json`;
// Read once to migrate (ADR-077), then deleted.
export const LEGACY_PICKED_PATH = `${PATHS.etc}/offline.json`;
export const LEGACY_STATE_DIR = `${PATHS.var_lib}/offline`;
export const LEGACY_STATE_PATH = `${LEGACY_STATE_DIR}/state.json`;

export interface StoreState {
  build: number;
  apps: AppId[];
}

const picked_schema = z.object({ version: z.literal(1), apps: z.array(z.string().min(1)) });
const state_schema = z.object({ build: z.number().finite(), apps: z.array(z.string().min(1)) });

function parse<T>(schema: z.ZodType<T>, text: string | null): T | null {
  if (text === null) return null;
  try {
    const result = schema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parse_picked(text: string | null): AppId[] | null {
  const parsed = parse(picked_schema, text);
  return parsed ? [...new Set(parsed.apps)] : null;
}

export function parse_state(text: string | null): StoreState | null {
  const parsed = parse(state_schema, text);
  return parsed ? { build: parsed.build, apps: [...new Set(parsed.apps)] } : null;
}

export function serialize_state(state: StoreState): string {
  return JSON.stringify({ build: state.build, apps: [...state.apps].sort() }, null, 2);
}
