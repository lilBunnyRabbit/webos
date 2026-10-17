export interface Series {
  name: string;
  stroke: string;
  fill: string;
  values: readonly number[];
}

export const SERIES_COLOURS = [
  { stroke: "stroke-primary", fill: "bg-primary" },
  { stroke: "stroke-secondary", fill: "bg-secondary" },
  { stroke: "stroke-tertiary", fill: "bg-tertiary" },
  { stroke: "stroke-accent", fill: "bg-accent" },
  { stroke: "stroke-foreground/70", fill: "bg-foreground/70" },
] as const;

export const MAX_SERIES = SERIES_COLOURS.length;

export interface Range {
  min: number;
  max: number;
}

export function value_range(lists: readonly (readonly number[])[]): Range | null {
  let min = Infinity;
  let max = -Infinity;
  for (const values of lists) {
    for (const value of values) {
      if (!Number.isFinite(value)) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  if (min === Infinity) return null;
  if (min === max) return { min: min - 1, max: max + 1 };
  const pad = (max - min) * 0.05;
  return { min: min - pad, max: max + pad };
}

/** A gap in the line where a value isn't finite (x / 0), rather than a spike to the edge. */
export function line_path(values: readonly number[], count: number, range: Range, width: number, height: number): string {
  if (count < 2) return "";
  const span = range.max - range.min;
  let path = "";
  let drawing = false;
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!Number.isFinite(value)) {
      drawing = false;
      continue;
    }
    const x = (index / (count - 1)) * width;
    const y = height - ((value - range.min) / span) * height;
    path += `${drawing ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    drawing = true;
  }
  return path;
}

export function series_paths(series: readonly Series[], count: number, width: number, height: number, shared: boolean): string[] {
  const common = shared ? value_range(series.map((entry) => entry.values)) : null;
  return series.map((entry) => {
    const range = common ?? value_range([entry.values]);
    return range ? line_path(entry.values, count, range, width, height) : "";
  });
}

export function format_value(value: number | string | undefined): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return `"${value}"`;
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return value > 0 ? "∞" : "−∞";
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function to_csv(columns: readonly string[], rows: readonly (readonly (number | string)[])[]): string {
  const cell = (value: number | string) => (typeof value === "number" ? String(value) : `"${value.replace(/"/g, '""')}"`);
  return [columns.map(cell).join(","), ...rows.map((row) => row.map(cell).join(","))].join("\n") + "\n";
}
