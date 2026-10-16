import type { ThemeBase } from "$lib/core/api";

const RECENT_CAP = 3;

/** The last generated themes, newest first. Module state on purpose (owner): they outlive the Settings window, not a reload. */
export const generator = $state({ recent: [] as ThemeBase[] });

const same = (a: ThemeBase, b: ThemeBase) => (Object.keys(a) as (keyof ThemeBase)[]).every((token) => a[token] === b[token]);

export function remember(base: ThemeBase) {
  generator.recent = [base, ...generator.recent.filter((entry) => !same(entry, base))].slice(0, RECENT_CAP);
}
