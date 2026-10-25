import type { AppManifest } from "./type";

/** The letter index, in rail order: `#` gathers names that don't start with a Latin letter. */
export const LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

/** The rail letter a name files under. Accents fold to their base letter (Č → C, É → E). */
export function initial(name: string): string {
  const first = name.trim().normalize("NFD").toUpperCase()[0] ?? "";
  return /[A-Z]/.test(first) ? first : "#";
}

/** Apps by `initial()` of their name, each group sorted by name. Letters with no app have no entry. */
export function group_by_letter<T extends AppManifest>(apps: Iterable<T>): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const app of [...apps].sort((a, b) => a.name.localeCompare(b.name))) {
    const letter = initial(app.name);
    const group = groups.get(letter);
    if (group) group.push(app);
    else groups.set(letter, [app]);
  }
  return groups;
}
