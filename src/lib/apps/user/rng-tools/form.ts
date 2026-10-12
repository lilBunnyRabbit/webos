export function as_number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
