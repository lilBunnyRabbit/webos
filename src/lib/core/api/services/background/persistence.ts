import { z } from "zod";
import type { AppId, AppProps } from "../apps/type";

export const BACKGROUND_PATH = "/var/lib/background/state.json";

export interface ResumeEntry {
  props: AppProps;
  /** When the job that asked for it started. */
  since: number;
}

export interface BackgroundState {
  version: 1;
  resume: Record<AppId, ResumeEntry>;
}

export const EMPTY_STATE: BackgroundState = { version: 1, resume: {} };

const EntrySchema = z.object({ props: z.record(z.string(), z.unknown()), since: z.number().finite() });
const StateShape = z.object({ version: z.literal(1), resume: z.record(z.string(), z.unknown()) });

export function parse_state(text: string | null): BackgroundState {
  if (text === null) return EMPTY_STATE;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return EMPTY_STATE;
  }
  const shape = StateShape.safeParse(value);
  if (!shape.success) return EMPTY_STATE;
  const resume: Record<AppId, ResumeEntry> = {};
  for (const [app_id, entry] of Object.entries(shape.data.resume)) {
    const parsed = EntrySchema.safeParse(entry);
    if (parsed.success) resume[app_id] = parsed.data;
  }
  return { version: 1, resume };
}

export function serialize_state(state: BackgroundState): string {
  return JSON.stringify(state, null, 2) + "\n";
}

export function with_resume(state: BackgroundState, app_id: AppId, entry: ResumeEntry | null): BackgroundState {
  const resume = { ...state.resume };
  if (entry) resume[app_id] = entry;
  else delete resume[app_id];
  return { version: 1, resume };
}
