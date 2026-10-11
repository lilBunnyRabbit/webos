/** Why `name` can't be used as a new entry next to `taken` names, or `null` if it can. `except` is the entry being renamed. */
export function name_problem(name: string, taken: string[], except?: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "." || trimmed === "..") return "That name is reserved.";
  if (trimmed.includes("/")) return "Names can't contain “/”.";
  if (trimmed !== except && taken.includes(trimmed)) return "Something here already has that name.";
  return null;
}
