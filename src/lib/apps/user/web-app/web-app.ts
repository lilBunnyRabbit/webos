import { z } from "zod";

export const APP_ID = "web-app";
export const EXTENSION = ".webapp";
export const DESKTOP_DIR = "/home/Desktop";
export const NOT_LOADING_AFTER_MS = 10_000;

export const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups";
export const ALLOW = [
  "fullscreen",
  "autoplay",
  "clipboard-read",
  "clipboard-write",
  "encrypted-media",
  "picture-in-picture",
  "web-share",
  "camera",
  "microphone",
  "geolocation",
].join("; ");

function parse_web_url(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

const web_url = z.string().refine((value) => parse_web_url(value) !== null, "not an http or https address");

export const WebAppSchema = z.object({
  name: z.string().trim().min(1),
  url: web_url,
  icon: web_url.optional(),
});
export type WebApp = z.infer<typeof WebAppSchema>;

export function normalize_url(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const url = parse_web_url(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (!url) return null;
  return url.hostname.includes(".") || url.hostname === "localhost" ? url.href : null;
}

/** With `allow-scripts` and `allow-same-origin`, a page from WebOS's own origin could lift its sandbox and reach OPFS. */
export function is_own_origin(url: string, origin: string): boolean {
  return new URL(url).origin === origin;
}

export function name_from_url(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const parts = host.split(".");
  const stem = parts.length > 1 ? parts.slice(0, -1).join(".") : host;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

export function favicon_url(app: Pick<WebApp, "url" | "icon">): string {
  return app.icon ?? `${new URL(app.url).origin}/favicon.ico`;
}

export function file_name_for(name: string): string {
  const stem = name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Web app";
  return `${stem}${EXTENSION}`;
}

export function serialize_web_app(app: WebApp): string {
  return JSON.stringify(app, null, 2) + "\n";
}

export function parse_web_app(text: string): WebApp | null {
  try {
    const result = WebAppSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
