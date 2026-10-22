import { app_name } from "./app-names";
import { detect_browser, type Browser } from "./browser";
import { check, min_text, type CompatResult, type Status } from "./check";
import { FEATURES, type Level } from "./features";

export interface CompatRow {
  id: string;
  feature: string;
  level: Level;
  status: Status;
  apps: string;
  min: string;
}

/** The full list for this browser, never scoped to a solo app: Settings › About and `compat` show everything. */
export function compat_now(): { browser: Browser; results: CompatResult[] } {
  const browser = detect_browser();
  return { browser, results: check(FEATURES, browser) };
}

export function compat_rows(results: CompatResult[]): CompatRow[] {
  return results.map(({ feature, status }) => ({
    id: feature.id,
    feature: feature.name,
    level: feature.level,
    status,
    apps: (feature.apps ?? []).map(app_name).join(", "),
    min: min_text(feature),
  }));
}

export function compat_report(): CompatRow[] {
  return compat_rows(compat_now().results);
}
