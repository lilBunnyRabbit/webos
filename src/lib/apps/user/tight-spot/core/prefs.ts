import { z } from "zod";

export const PREFS_FILE = "storage.json";
export const prefs_schema = z.record(z.string(), z.unknown());

export interface Prefs {
  value: Record<string, unknown>;
}
