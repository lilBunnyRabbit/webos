import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { createTV } from "tailwind-variants";

// The design tokens added in app.css; without them `text-ui` would read as a colour and clash with `text-foreground`.
const TW_MERGE_CONFIG = {
  extend: {
    classGroups: {
      "font-size": [{ text: ["2xs", "ui"] }],
      shadow: [{ shadow: ["raised", "popover", "window", "window-focused"] }],
    },
  },
};

const tw_merge = extendTailwindMerge(TW_MERGE_CONFIG);

export function cn(...inputs: ClassValue[]) {
  return tw_merge(clsx(inputs));
}

/** tailwind-variants with the same merge rules as `cn()`. */
export const tv = createTV({ twMergeConfig: TW_MERGE_CONFIG });
export function ov<K extends PropertyKey, T extends Record<K, ClassValue>>(map: Partial<T>, key: K): ClassValue {
  if (key in map) {
    return map[key];
  }

  return "";
}

export function format_bytes(bytes: number): string {
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  if (bytes < k) return `${bytes} B`;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

const BYTE_UNITS: Record<string, number> = { "": 1, b: 1, k: 1024, kb: 1024, m: 1024 ** 2, mb: 1024 ** 2, g: 1024 ** 3, gb: 1024 ** 3, t: 1024 ** 4, tb: 1024 ** 4 };

/** `2GB`, `1.5 g`, `500mb`, `4096`: binary units, the inverse of `format_bytes`. `null` when it isn't a size. */
export function parse_bytes(text: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*([kmgt]?b?)\s*$/i.exec(text);
  if (!match) return null;
  const bytes = Math.round(Number(match[1]) * BYTE_UNITS[match[2].toLowerCase()]);
  return bytes >= 1 && Number.isSafeInteger(bytes) ? bytes : null;
}

/** Dates everywhere in the UI: "Oct 11, 2026" (docs/design/patterns.md). */
export function format_date(date: Date | number): string {
  return new Date(date).toLocaleDateString([], { dateStyle: "medium" });
}

/** Date and time everywhere in the UI: "Oct 11, 2026, 14:03". */
export function format_datetime(date: Date | number): string {
  return new Date(date).toLocaleString([], { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" });
}

export function error_message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * A CSS colour as the canvas can take it. Tokens may be written with `var()`, `light-dark()` or relative colour
 * syntax, which a canvas can't parse, so `probe` (an element in the themed tree) resolves it.
 */
export function resolve_token(probe: HTMLElement, value: string): string {
  probe.style.color = value;
  const color = getComputedStyle(probe).color;
  probe.style.color = "";
  return color;
}

/** Safe in text and in quoted attribute values. */
export function escape_html(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
