// Shared with the build plugin, which type-checks without the app's types: the shapes here are plain data, and
// AppsService narrows `category`, `defaults` and `daily_rank` when it builds a stub.
interface Size {
  w: number;
  h: number;
}

/** The core hash under `bun dev` and in tests, where no build computed one. */
export const DEV_CORE = "dev";

export interface CatalogueApp {
  id: string;
  name: string;
  category: string;
  system: boolean;
  version: string;
  /** Internal: equal to the previous catalogue's, the app keeps its `version`. */
  hash: string;
  manifest: string;
  entry: string;
  files: string[];
  /** Files fetched when read and cached then, never installed: Docs' pages (ADR-077). */
  content?: string[];
  associations?: string[];
  tools?: string[];
  description?: string;
  keywords?: string[];
  pitch?: { problem: string; solution: string };
  authors?: { name: string; github?: string; url?: string }[];
  defaults?: Record<string, unknown>;
  replaces?: { app: string; props?: Record<string, unknown> }[];
  restore?: boolean;
  daily_rank?: string | Record<string, string>;
  daily?: boolean;
  widget?: boolean;
  widget_size?: { min: Size; max: Size; default: Size };
  default_widget?: boolean;
  highlights?: boolean;
  guide?: boolean;
  guide_on_launch?: boolean;
  preview?: boolean;
  shell?: boolean;
  badge?: boolean;
  on_fire?: boolean;
  on_uninstall_data?: boolean;
  /** How many achievements the manifest declares; their text is in `store/achievements.json` (ADR-078). */
  achievements?: number;
  background?: boolean;
  /** The kinds of sheet the app provides (ADR-079). */
  provides?: string[];
}

export type CatalogueData = Omit<CatalogueApp, "version" | "hash" | "manifest" | "entry" | "files" | "content">;

export interface Catalogue {
  version: 1;
  core: string;
  /** `buildTimestamp`: the file names inside are this build's; another build's entries never run here. */
  build: number;
  release: string;
  commit?: string;
  branch?: string;
  apps: CatalogueApp[];
}

export type CatalogueHeader = Omit<Catalogue, "apps">;

/** `<meta name="webos-core">` in `index.html`: the build writes the core hash there, the page reads its own from it. */
export const CORE_META = "webos-core";

export const LAZY_PARTS = ["shell", "widget", "highlights", "guide", "preview", "on_fire", "on_uninstall_data", "background"] as const;
export type LazyPart = (typeof LAZY_PARTS)[number];

export function json_safe(value: unknown): unknown {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value !== "object") return undefined;
  if (Array.isArray(value) || Symbol.iterator in value) return [...(value as Iterable<unknown>)].map(json_safe);
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const safe = json_safe(item);
    if (safe !== undefined) out[key] = safe;
  }
  return out;
}

function zod_shape(schema: unknown): Record<string, unknown> | null {
  const shape = (schema as { shape?: unknown } | null)?.shape;
  return shape && typeof shape === "object" ? (shape as Record<string, unknown>) : null;
}

export function manifest_data(manifest: Record<string, unknown>, meta: Record<string, unknown>, system: boolean): CatalogueData {
  const has = (key: string) => typeof manifest[key] === "function" || undefined;
  const shape = zod_shape(manifest.props);
  const provides = manifest.provides && typeof manifest.provides === "object" ? Object.keys(manifest.provides) : [];
  const data = {
    id: manifest.id,
    name: manifest.name,
    category: manifest.category,
    system,
    associations: manifest.associations,
    tools: manifest.tools,
    description: meta.description,
    keywords: meta.keywords,
    pitch: meta.pitch,
    authors: meta.authors,
    defaults: manifest.defaults,
    replaces: manifest.replaces,
    restore: manifest.restore === false ? false : undefined,
    daily_rank: manifest.daily_rank,
    daily: shape && "daily" in shape ? true : undefined,
    widget: has("widget"),
    widget_size: manifest.widget_size,
    default_widget: manifest.default_widget === true || undefined,
    highlights: has("highlights"),
    guide: has("guide"),
    guide_on_launch: manifest.guide_on_launch === false ? false : undefined,
    preview: has("preview"),
    shell: has("shell"),
    badge: has("badge"),
    on_fire: has("on_fire"),
    on_uninstall_data: has("on_uninstall_data"),
    achievements: Array.isArray(manifest.achievements) && manifest.achievements.length > 0 ? manifest.achievements.length : undefined,
    background: has("background"),
    provides: provides.length ? provides : undefined,
  };
  return json_safe(data) as CatalogueData;
}

const is_entry = (app: unknown): app is CatalogueApp => {
  const entry = app as Partial<CatalogueApp> | null;
  return typeof entry?.id === "string" && typeof entry.name === "string" && typeof entry.category === "string" && typeof entry.manifest === "string";
};

export function parse_catalogue(value: unknown): Catalogue | null {
  const catalogue = value as Catalogue | null;
  if (!catalogue || catalogue.version !== 1 || typeof catalogue.release !== "string" || !Array.isArray(catalogue.apps)) return null;
  return { ...catalogue, apps: catalogue.apps.filter(is_entry) };
}

export function parse_catalogue_text(text: string | null): Catalogue | null {
  if (text === null) return null;
  try {
    return parse_catalogue(JSON.parse(text));
  } catch {
    return null;
  }
}

export function serialize_slice(catalogue: CatalogueHeader, apps: Iterable<CatalogueApp>): string {
  const sorted = [...apps].sort((a, b) => a.id.localeCompare(b.id));
  const { core, build, release, commit, branch } = catalogue;
  return JSON.stringify({ version: 1, core, build, release, commit, branch, apps: sorted });
}
