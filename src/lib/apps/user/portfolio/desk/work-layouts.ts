const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function month_of(text: string, now: Date = new Date()): number | null {
  const value = text.trim().toLowerCase();
  if (value === "present" || value === "now") return now.getFullYear() * 12 + now.getMonth();
  const match = value.match(/^([a-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]);
  return month < 0 ? null : Number(match[2]) * 12 + month;
}

export interface Span {
  start: number;
  end: number;
}

export function span_of(period: string, now?: Date): Span | null {
  const [from, to] = period.split(/\s*[–—-]\s*/);
  if (!from || !to) return null;
  const start = month_of(from, now);
  const end = month_of(to, now);
  return start === null || end === null || end <= start ? null : { start, end };
}

export interface Years {
  from: number;
  to: number;
}

export function years_of(period: string, now?: Date): Years | null {
  const span = span_of(period, now);
  return span ? { from: Math.floor(span.start / 12), to: Math.floor(span.end / 12) } : null;
}
