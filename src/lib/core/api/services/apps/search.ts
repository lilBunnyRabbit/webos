import { AppCategory, type AppListing, type AppManifest } from "./type";

export const APP_CATEGORY_LABELS: Record<AppCategory, string> = {
  [AppCategory.PRODUCTIVITY]: "Productivity",
  [AppCategory.MEDIA]: "Media",
  [AppCategory.UTILITIES]: "Utilities",
  [AppCategory.DEVELOPER]: "Developer",
  [AppCategory.GAMES]: "Games",
};

export interface AppSection<T extends AppManifest = AppManifest> {
  id: AppCategory | "system";
  label: string;
  apps: T[];
}

function by_name(a: AppManifest, b: AppManifest): number {
  return a.name.localeCompare(b.name);
}

// Below this length a one-letter slip matches too much ("cat" ~ "car", "map").
const TYPO_MIN_LENGTH = 5;
const TYPO_RANK = 5;

/** At most one insertion, deletion, substitution or swap of neighbours between `a` and `b`. */
export function within_one_edit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

const words_of = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Lower is better, `null` is no match. One query word against one app. */
function rank_word(manifest: AppListing, needle: string): number | null {
  const name = manifest.name.toLowerCase();
  if (name.startsWith(needle)) return 0;
  if (name.split(/[\s-]+/).some((word) => word.startsWith(needle))) return 1;
  if (name.includes(needle)) return 2;
  const includes = (text: string) => text.toLowerCase().includes(needle);
  const keywords = [manifest.id, ...(manifest.keywords ?? [])];
  if (keywords.some(includes)) return 3;
  const other = [manifest.description ?? "", APP_CATEGORY_LABELS[manifest.category]];
  if (other.some(includes)) return 4;
  if (needle.length >= TYPO_MIN_LENGTH) {
    const words = [name, ...keywords, ...other].flatMap(words_of);
    if (words.some((word) => within_one_edit(word, needle) || (word.length > needle.length && within_one_edit(word.slice(0, needle.length + 1), needle)))) return TYPO_RANK;
  }
  return null;
}

/** Every query word must match; the app ranks by its weakest word, then by the sum. */
function rank(manifest: AppListing, needles: string[]): { worst: number; total: number } | null {
  let worst = 0;
  let total = 0;
  for (const needle of needles) {
    const value = rank_word(manifest, needle);
    if (value === null) return null;
    worst = Math.max(worst, value);
    total += value;
  }
  return { worst, total };
}

/**
 * Every app sorted by name, or the apps matching `query` best first. The query splits into words and every word must
 * match (case-insensitive substring): name prefix, a word in the name, anywhere in the name, id or keywords, then
 * description or category. Words of five letters or more also match a word one typo away, ranked last. Ties sort by
 * name.
 */
export function search_apps<T extends AppListing>(apps: Iterable<T>, query: string): T[] {
  const needles = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (needles.length === 0) return [...apps].sort(by_name);
  const whole = query.trim().toLowerCase();
  return [...apps]
    .map((manifest) => ({ manifest, rank: whole.includes(" ") && manifest.name.toLowerCase().startsWith(whole) ? { worst: -1, total: -1 } : rank(manifest, needles) }))
    .filter((entry): entry is { manifest: T; rank: { worst: number; total: number } } => entry.rank !== null)
    .sort((a, b) => a.rank.worst - b.rank.worst || a.rank.total - b.rank.total || by_name(a.manifest, b.manifest))
    .map((entry) => entry.manifest);
}

/** Apps grouped for the launcher: one section per category in declaration order, system apps last. Empty ones are left out. */
export function group_apps<T extends AppManifest>(apps: Iterable<T>): AppSection<T>[] {
  const sections: AppSection<T>[] = [
    ...Object.values(AppCategory).map((id) => ({ id, label: APP_CATEGORY_LABELS[id], apps: [] as T[] })),
    { id: "system", label: "System", apps: [] },
  ];
  for (const manifest of [...apps].sort(by_name)) {
    sections.find((section) => section.id === (manifest.system ? "system" : manifest.category))!.apps.push(manifest);
  }
  return sections.filter((section) => section.apps.length > 0);
}
