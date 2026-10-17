import type { FetchInfo } from "./parse";

export interface FetchedPage {
  url: string;
  html: string;
  info: FetchInfo;
}

export interface ImageProbe {
  url: string;
  loaded: boolean;
  width: number | null;
  height: number | null;
  bytes: number | null;
  type: string | null;
  status: number | null;
}

export interface RobotsGroup {
  agent: string;
  paths: string[];
}

export interface RobotsInfo {
  url: string;
  status: number | null;
  groups: RobotsGroup[];
}

const LOCAL = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$|\?)/i;

export function normalize_url(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `${LOCAL.test(trimmed) ? "http" : "https"}://${trimmed}`;
}

export async function fetch_page(url: string, signal: AbortSignal): Promise<FetchedPage> {
  const started = performance.now();
  const response = await fetch(url, { signal, cache: "no-store", redirect: "follow" });
  const html = await response.text();
  return {
    url: response.url || url,
    html,
    info: {
      requested: url,
      status: response.status,
      status_text: response.statusText,
      content_type: response.headers.get("content-type"),
      headers: Object.fromEntries([...response.headers].map(([name, value]) => [name.toLowerCase(), value])),
      bytes: new Blob([html]).size,
      ms: performance.now() - started,
    },
  };
}

function measure(src: string): Promise<{ width: number; height: number } | null> {
  const image = new Image();
  image.referrerPolicy = "no-referrer";
  image.src = src;
  return image.decode().then(
    () => ({ width: image.naturalWidth, height: image.naturalHeight }),
    () => null
  );
}

// Reading the bytes needs CORS; an <img> still gives the pixel size without it.
export async function probe_image(url: string, signal: AbortSignal): Promise<ImageProbe> {
  const probe: ImageProbe = { url, loaded: false, width: null, height: null, bytes: null, type: null, status: null };
  let blob: Blob | null = null;
  try {
    const response = await fetch(url, { signal, cache: "no-store", referrerPolicy: "no-referrer" });
    probe.status = response.status;
    probe.type = response.headers.get("content-type");
    if (response.ok) {
      blob = await response.blob();
      probe.bytes = blob.size;
    }
  } catch {
    if (signal.aborted) return probe;
  }
  if (probe.status !== null && probe.status >= 400) return probe;
  const object_url = blob ? URL.createObjectURL(blob) : null;
  const size = await measure(object_url ?? url);
  if (object_url) URL.revokeObjectURL(object_url);
  if (size) Object.assign(probe, { loaded: true, ...size });
  return probe;
}

export function parse_robots(body: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let reading_agents = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const directive = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (directive === "user-agent") {
      // Consecutive User-agent lines share the rules that follow them.
      if (!reading_agents || !current) {
        current = { agent: value.toLowerCase(), paths: [] };
        groups.push(current);
      } else {
        const shared: RobotsGroup = { agent: value.toLowerCase(), paths: current.paths };
        groups.push(shared);
      }
      reading_agents = true;
    } else {
      reading_agents = false;
      if (directive === "disallow" && current && value) current.paths.push(value);
    }
  }
  return groups;
}

export async function probe_robots(page_url: string, signal: AbortSignal): Promise<RobotsInfo | null> {
  const url = new URL("/robots.txt", page_url).toString();
  try {
    const response = await fetch(url, { signal, cache: "no-store" });
    return { url, status: response.status, groups: response.ok ? parse_robots((await response.text()).slice(0, 64_000)) : [] };
  } catch {
    return null;
  }
}
