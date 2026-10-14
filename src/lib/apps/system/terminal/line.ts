import type { Completion } from "$lib/core/api";

/** The longest start every value shares. */
export function common_prefix(values: string[]): string {
  if (values.length === 0) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < value.length && prefix[index].toLowerCase() === value[index].toLowerCase()) index++;
    prefix = prefix.slice(0, index);
  }
  return prefix;
}

/** Puts `value` over `input[from, to)`, adding a space after a final completion. Returns the line and the new cursor. */
export function apply(input: string, from: number, to: number, item: Pick<Completion, "value" | "final">): { line: string; cursor: number } {
  const insert = item.value + (item.final === false ? "" : " ");
  const after = input.slice(to);
  const spaced = item.final !== false && after.startsWith(" ") ? insert.trimEnd() : insert;
  return { line: input.slice(0, from) + spaced + after, cursor: from + spaced.length };
}

/** fish: the newest history line that continues what's typed. */
export function history_hint(input: string, history: readonly string[]): string {
  if (input.trim() === "") return "";
  for (let index = history.length - 1; index >= 0; index--) {
    const line = history[index];
    if (line.length > input.length && line.startsWith(input)) return line.slice(input.length);
  }
  return "";
}
