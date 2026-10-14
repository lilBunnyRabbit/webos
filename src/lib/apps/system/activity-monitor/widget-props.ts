const MAX_VALUE = 24;

function format_value(value: unknown): string {
  if (typeof value === "string") {
    const text = value.startsWith("/") ? (value.split("/").filter(Boolean).at(-1) ?? value) : value;
    return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text;
  }
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).length}}`;
  return String(value);
}

export function summarize_props(props: Record<string, unknown> | undefined): string {
  const entries = Object.entries(props ?? {}).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return "—";
  return entries.map(([key, value]) => `${key}: ${format_value(value)}`).join(" · ");
}
