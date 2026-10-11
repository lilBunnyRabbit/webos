import type { FileSystemItem } from "$lib/core/api/services/files";

/** Why `name` can't be used as a new entry in a folder holding `items`, or `null` if it can. `except` is the entry being renamed. */
export function name_problem(name: string, items: FileSystemItem[], except?: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "." || trimmed === "..") return "That name is reserved.";
  if (trimmed.includes("/")) return "Names can't contain “/”.";
  if (trimmed !== except && items.some((item) => item.name === trimmed)) return "Something here already has that name.";
  return null;
}
