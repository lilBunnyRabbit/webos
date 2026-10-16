import type { SavedTheme, Theme } from "./type";

const key = (name: string) => name.trim().toLowerCase();

/** The saved theme named `name`, case and outer spaces ignored. */
export function find_saved(saved: SavedTheme[], name: string): SavedTheme | undefined {
  return saved.find((entry) => key(entry.name) === key(name));
}

/** Saves `theme` as `name`, replacing one with the same name in place, else adding it at the end. */
export function with_saved(saved: SavedTheme[], name: string, theme: Theme): SavedTheme[] {
  const entry = { name: name.trim(), theme: { ...theme } };
  const index = saved.findIndex((candidate) => key(candidate.name) === key(name));
  return index === -1 ? [...saved, entry] : saved.map((candidate, at) => (at === index ? entry : candidate));
}

export function without_saved(saved: SavedTheme[], name: string): SavedTheme[] {
  return saved.filter((entry) => key(entry.name) !== key(name));
}

/** Renames in place; a clash with another saved theme's name leaves the list unchanged. */
export function renamed_saved(saved: SavedTheme[], from: string, to: string): SavedTheme[] {
  if (key(from) !== key(to) && find_saved(saved, to)) return saved;
  return saved.map((entry) => (key(entry.name) === key(from) ? { ...entry, name: to.trim() } : entry));
}
