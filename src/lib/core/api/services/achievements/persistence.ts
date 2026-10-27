import { z } from "zod";
import { PATHS } from "../files/hierarchy";
import type { AppId } from "../apps/type";
import { ACHIEVEMENTS_FILE } from "./validate";

export { ACHIEVEMENTS_FILE };

const VERSION = 1;

export function achievements_path(app_id: AppId): string {
  return `${PATHS.var_lib}/apps/${app_id}/${ACHIEVEMENTS_FILE}`;
}

export interface AchievementRecord {
  /** Achievement id → epoch ms. */
  unlocked: Record<string, number>;
  progress: Record<string, number>;
}

export const empty_record = (): AchievementRecord => ({ unlocked: {}, progress: {} });

const record_schema = z.object({
  version: z.literal(VERSION),
  unlocked: z.record(z.string(), z.number().nonnegative()),
  progress: z.record(z.string(), z.number().nonnegative()),
});

export function parse_record(text: string | null): AchievementRecord {
  if (text === null) return empty_record();
  try {
    const result = record_schema.safeParse(JSON.parse(text));
    return result.success ? { unlocked: result.data.unlocked, progress: result.data.progress } : empty_record();
  } catch {
    return empty_record();
  }
}

const sorted = <T>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

export function serialize_record(record: AchievementRecord): string {
  return JSON.stringify({ version: VERSION, unlocked: sorted(record.unlocked), progress: sorted(record.progress) }) + "\n";
}

export function same_record(a: AchievementRecord, b: AchievementRecord): boolean {
  return serialize_record(a) === serialize_record(b);
}
