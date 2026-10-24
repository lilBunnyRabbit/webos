import { compare_versions, Engine, MIN_KEY, type Browser } from "./browser";
import { Level, type Feature } from "./features";

export const Status = {
  MISSING: "missing",
  OUTDATED: "outdated",
  OK: "ok",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export interface CompatResult {
  feature: Feature;
  status: Status;
}

export const DISMISSED_KEY = "webos.compat.dismissed";

// Kept equal to `SOLO_PREFIX` in kernel/mode.ts by a test: importing it would pull the core chunk into boot.
export const SOLO_HASH = "#/solo/";

function run_probe(feature: Feature): boolean {
  try {
    return feature.probe();
  } catch {
    return false;
  }
}

export function status(feature: Feature, browser: Browser, supported: boolean = run_probe(feature)): Status {
  if (!supported) return Status.MISSING;
  if (!browser.engine || !browser.engine_version) return Status.OK;
  const min = feature.min[MIN_KEY[browser.engine]];
  if (min === null || compare_versions(browser.engine_version, min) < 0) return Status.OUTDATED;
  return Status.OK;
}

export function check(features: Feature[], browser: Browser, probe: (feature: Feature) => boolean = run_probe): CompatResult[] {
  return features.map((feature) => ({ feature, status: status(feature, browser, probe(feature)) }));
}

export function solo_app(hash: string): string | null {
  if (!hash.startsWith(SOLO_HASH)) return null;
  const id = hash.slice(SOLO_HASH.length).split(/[?/#]/)[0];
  return id ? decodeURIComponent(id) : null;
}

export function in_scope(feature: Feature, app: string | null): boolean {
  return app === null || feature.level === Level.START || (feature.apps?.includes(app) ?? false);
}

export function problems(results: CompatResult[]): CompatResult[] {
  return results.filter((result) => result.status !== Status.OK);
}

export function parse_dismissed(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function should_show(results: CompatResult[], dismissed: string[]): boolean {
  return problems(results).some((result) => !dismissed.includes(result.feature.id));
}

/**
 * The set "Don't show again" stores. Full WebOS replaces it with what's wrong now; a solo link adds its few ids, so
 * dismissing there never hides the rest from full WebOS.
 */
export function next_dismissed(existing: string[], results: CompatResult[], solo: boolean): string[] {
  const ids = problems(results).map((result) => result.feature.id);
  return [...new Set(solo ? [...existing, ...ids] : ids)].sort();
}

/**
 * Whether a newer version of this browser would fix it. A feature missing from a version already past `min` is one the
 * browser leaves out on this OS (BarcodeDetector in Chrome on Windows, the AI APIs in Chrome on Android): updating
 * changes nothing.
 */
export function fixed_by_update(result: CompatResult, browser: Browser): boolean {
  if (!browser.engine || !browser.engine_version) return true;
  const min = result.feature.min[MIN_KEY[browser.engine]];
  if (min === null) return false;
  return result.status === Status.OUTDATED || compare_versions(browser.engine_version, min) < 0;
}

const ENGINE_NAME: Record<Engine, string> = {
  [Engine.CHROMIUM]: "Chromium",
  [Engine.GECKO]: "Firefox",
  [Engine.WEBKIT]: "Safari",
};

export function requirement(feature: Feature, browser: Browser): string {
  const { chrome, firefox, safari } = feature.min;
  if (!browser.engine) {
    const list = [
      ["Chrome", chrome],
      ["Firefox", firefox],
      ["Safari", safari],
    ].filter(([, version]) => version !== null);
    return list.length > 0 ? `Works in ${list.map(([name, version]) => `${name} ${version}`).join(", ")}` : "Not available in any browser yet";
  }
  const min = feature.min[MIN_KEY[browser.engine]];
  const ios = browser.os === "iOS";
  if (min === null) return ios ? "Not available on iOS yet" : `Not available in ${ENGINE_NAME[browser.engine]} yet`;
  if (!fixed_by_update({ feature, status: Status.MISSING }, browser)) {
    const name = ios ? null : (browser.name ?? ENGINE_NAME[browser.engine]);
    const where = [name && `in ${name}`, browser.os && `on ${browser.os}`].filter(Boolean).join(" ");
    return `Not available ${where || "in this browser"}`;
  }
  if (ios) return `Update to iOS ${min} or later`;
  if (browser.engine === Engine.CHROMIUM) {
    return browser.name === "Chrome" || browser.name === "Edge" || browser.name === "Brave"
      ? `Update to ${browser.name} ${min} or later`
      : `Needs Chromium ${min} or later`;
  }
  return `Update to ${ENGINE_NAME[browser.engine]} ${min} or later`;
}

export function min_text(feature: Feature): string {
  const { chrome, firefox, safari } = feature.min;
  return `Chrome ${chrome ?? "no"}, Firefox ${firefox ?? "no"}, Safari ${safari ?? "no"}`;
}
