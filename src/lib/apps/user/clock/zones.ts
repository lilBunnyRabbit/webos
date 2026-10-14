import { pad2 } from "$lib/core/utils";
export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(zone, format);
  }
  return format;
}

export function local_zone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function all_zones(): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes("UTC") ? zones : [...zones, "UTC"];
}

export function is_zone(zone: string): boolean {
  try {
    formatter(zone);
    return true;
  } catch {
    return false;
  }
}

export function wall_time(at: number, zone: string): WallTime {
  const parts: Record<string, number> = {};
  for (const part of formatter(zone).formatToParts(at))
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

export function zone_offset(at: number, zone: string): number {
  const wall = wall_time(at, zone);
  const as_utc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return Math.round((as_utc - Math.floor(at / 1000) * 1000) / 60_000);
}

export function format_offset(minutes: number): string {
  if (minutes === 0) return "Same time";
  const sign = minutes > 0 ? "+" : "−";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  if (!hours) return `${sign}${rest} min`;
  return rest ? `${sign}${hours} h ${rest}` : `${sign}${hours} h`;
}

export function format_utc_offset(minutes: number): string {
  if (minutes === 0) return "UTC";
  const sign = minutes > 0 ? "+" : "−";
  const abs = Math.abs(minutes);
  const rest = abs % 60;
  return `UTC${sign}${Math.floor(abs / 60)}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

export function day_shift(at: number, zone: string, home: string): number {
  const a = wall_time(at, zone);
  const b = wall_time(at, home);
  return Math.sign(Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day));
}

export function day_label(shift: number): string {
  return shift < 0 ? "Yesterday" : shift > 0 ? "Tomorrow" : "Today";
}

export function is_daytime(hour: number): boolean {
  return hour >= 6 && hour < 18;
}

export function format_wall(wall: WallTime, seconds = false): string {
  return `${pad2(wall.hour)}:${pad2(wall.minute)}${seconds ? `:${pad2(wall.second)}` : ""}`;
}

export function zone_city(zone: string): string {
  return zone.slice(zone.lastIndexOf("/") + 1).replaceAll("_", " ");
}

export function zone_region(zone: string): string {
  return zone.split("/").slice(0, -1).join(" · ").replaceAll("_", " ");
}

export function search_zones(zones: string[], query: string, limit = 50): string[] {
  const q = query.trim().toLowerCase().replaceAll(" ", "_");
  if (!q) return zones.slice(0, limit);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const zone of zones) {
    const lower = zone.toLowerCase();
    const city = lower.slice(lower.lastIndexOf("/") + 1);
    if (city.startsWith(q) || lower.startsWith(q)) starts.push(zone);
    else if (lower.includes(q)) contains.push(zone);
  }
  return [...starts, ...contains].slice(0, limit);
}
