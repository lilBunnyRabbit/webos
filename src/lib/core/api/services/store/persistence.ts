import { z } from "zod";
import { PATHS } from "../files/hierarchy";
import type { AppId } from "../apps/type";

export const PICKED_PATH = `${PATHS.etc}/offline.json`;
export const OFFLINE_STATE_PATH = `${PATHS.var_lib}/offline/state.json`;

export interface OfflineState {
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

export function serialize_picked(apps: Iterable<AppId>): string {
  return JSON.stringify({ version: 1, apps: [...apps].sort() }, null, 2);
}

export function parse_state(text: string | null): OfflineState | null {
  const parsed = parse(state_schema, text);
  return parsed ? { build: parsed.build, apps: [...new Set(parsed.apps)] } : null;
}

export function serialize_state(state: OfflineState): string {
  return JSON.stringify({ build: state.build, apps: [...state.apps].sort() }, null, 2);
}
