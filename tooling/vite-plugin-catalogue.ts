import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createServer, type Plugin, type ResolvedConfig, type ViteDevServer } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import type { VersionInfo } from "./vite-plugin-version";
import { manifest_data, parse_catalogue, type Catalogue, type CatalogueData } from "../src/lib/core/api/services/apps/catalogue";

export { json_safe, manifest_data, parse_catalogue, type Catalogue, type CatalogueApp } from "../src/lib/core/api/services/apps/catalogue";

/** Where the build finds the live catalogue, to keep each unchanged app's version. Overridden by `WEBOS_PREVIOUS_CATALOGUE`; empty skips it. */
export const PREVIOUS_CATALOGUE = "https://lilbunnyrabbit.github.io/webos/store/catalogue.json";
const PREVIOUS_TIMEOUT_MS = 5000;
/** Each manifest chunk is an entry named `{id}.manifest`; boot never loads one. */
export const MANIFEST_SUFFIX = ".manifest";
export const is_manifest_chunk = (name: string) => name.endsWith(MANIFEST_SUFFIX);
const APP_KINDS = ["system", "user"] as const;
const COMPONENT_IMPORT = /\bcomponent\s*:\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)/;
const TEXT_FILE = /\.(m?js|css|html|json|svg|txt|md)$/;
const PRECACHED_PUBLIC = /\.(m?js|css|html|woff2)$/;
// Content-hashed names (`name-HASH8.ext`), as Rollup and Vite write them.
const HASHED_NAME = /([\w.-]+)-[\w-]{8}(\.[a-z0-9]+)\b/g;

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  changes: { kind: string; text: string }[];
}

export interface VersionFields {
  core: string;
  notes: ReleaseNote[];
}

export interface CollectedApp {
  data: CatalogueData;
  symbol: string;
  index: string;
  component: string;
  source: string;
}

interface ManifestModule {
  default: Record<string, unknown> & { id: string; name: string; category: string; icon: unknown; props?: unknown };
}

interface MetaModule {
  default: Record<string, unknown>;
}

type Render = (component: unknown, options: { props: Record<string, unknown> }) => { body: string };
export type Load = (id: string) => Promise<unknown>;

function sha(parts: Iterable<string | Buffer>): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part).update("\0");
  return hash.digest("base64url").slice(0, 16);
}

function attributes(text: string): [string, string][] {
  return [...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]);
}

/**
 * A rendered icon as a sprite `<symbol>`. Sizing attributes go; the rest of the `<svg>`'s presentation attributes move
 * to a `<g>`, so `currentColor` and `var(--primary)` still resolve where the icon is `<use>`d.
 */
export function icon_symbol(id: string, html: string): string {
  const match = html.replace(/<!--[\s\S]*?-->/g, "").match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/);
  if (!match) throw new Error(`catalogue: ${id}'s icon renders no <svg>`);
  const attrs = attributes(match[1]);
  const view_box = attrs.find(([name]) => name === "viewBox")?.[1];
  if (!view_box) throw new Error(`catalogue: ${id}'s icon has no viewBox`);
  const dropped = new Set(["xmlns", "viewBox", "width", "height", "aria-hidden", "class", "role"]);
  const kept = attrs.filter(([name]) => !dropped.has(name)).map(([name, value]) => ` ${name}="${value}"`).join("");
  const body = match[2].trim();
  return `<symbol id="${id}" viewBox="${view_box}">${kept ? `<g${kept}>${body}</g>` : body}</symbol>`;
}

export function icon_sprite(symbols: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join("")}</svg>`;
}

export function component_import(source: string): string | null {
  return COMPONENT_IMPORT.exec(source)?.[1] ?? null;
}

export function unhashed(text: string): string {
  return text.replace(HASHED_NAME, "$1$2");
}

/**
 * What a hash reads instead of a file's text, so two builds of the same code hash the same. Every build stamps
 * `version`, `commit`, `branch`, `buildTime` and `buildTimestamp` into the bundle, and a file that imports a stamped
 * chunk (`main`) names it by a hash that changes with the stamp: both become placeholders. A file's own change still
 * counts, because every file in a hashed set is read.
 */
export function content_normalizer(info: VersionInfo): (text: string) => string {
  const stamps = [String(info.buildTimestamp), info.buildTime, info.commit, info.branch, info.version]
    .filter((stamp) => stamp.length >= 4 && stamp !== "unknown")
    .sort((a, b) => b.length - a.length);
  return (text) => unhashed(stamps.reduce((out, stamp, index) => out.replaceAll(stamp, `\0stamp${index}\0`), text));
}

export function hash_files(names: string[], read: (name: string) => Buffer, normalize: (text: string) => string): string {
  // Several chunks share a name (`commands-*.js`), so the unhashed name alone doesn't give a stable order.
  const entries = names.map((name) => {
    const content = read(name);
    return `${unhashed(name)}\0${sha([TEXT_FILE.test(name) ? normalize(content.toString("utf8")) : content])}`;
  });
  return sha(entries.sort());
}

function compare_versions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** An app keeps the previous catalogue's version while its hash is the same; otherwise it's from this release. */
export function app_version(id: string, hash: string, previous: Catalogue | null, release: string): string {
  const before = previous?.apps.find((app) => app.id === id);
  return before && before.hash === hash ? before.version : release;
}

/** The top release, plus every one newer than the deployed catalogue's release. */
export function release_notes(changelog: ReleaseNote[], previous_release: string | null): ReleaseNote[] {
  const notes = changelog.filter((entry, index) => index === 0 || (previous_release !== null && compare_versions(entry.version, previous_release) > 0));
  return notes.map(({ version, date, title, changes }) => ({ version, date, title, changes: changes.map(({ kind, text }) => ({ kind, text })) }));
}

export async function fetch_previous(url: string): Promise<Catalogue | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PREVIOUS_TIMEOUT_MS), cache: "no-store" });
    return response.ok ? parse_catalogue(await response.json()) : null;
  } catch {
    return null;
  }
}

export function app_dirs(root: string): { id: string; system: boolean; index: string }[] {
  return APP_KINDS.flatMap((kind) => {
    const dir = path.join(root, "src/lib/apps", kind);
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(path.join(dir, entry.name, "index.ts")))
      .map((entry) => ({ id: entry.name, system: kind === "system", index: `src/lib/apps/${kind}/${entry.name}/index.ts` }));
  }).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Imports every manifest and its `meta` through `load` (Vite's SSR loader in the build and the dev server, a plain
 * import in tests), and renders each icon with Svelte's server renderer. A manifest that touches the DOM at module
 * level fails here.
 */
export async function collect_apps(root: string, load: Load): Promise<CollectedApp[]> {
  const { render } = (await load("svelte/server")) as { render: Render };
  const apps: CollectedApp[] = [];
  for (const { id, system, index } of app_dirs(root)) {
    let manifest: ManifestModule["default"];
    let meta: Record<string, unknown> = {};
    try {
      manifest = ((await load(`/${index}`)) as ManifestModule).default;
      const meta_loader = manifest.meta as (() => Promise<MetaModule>) | undefined;
      if (meta_loader) meta = (await meta_loader()).default;
    } catch (error) {
      throw new Error(`catalogue: ${index} can't run in Node (no DOM or window at module level): ${(error as Error).message}`);
    }
    if (manifest.id !== id) throw new Error(`catalogue: ${index} declares id "${manifest.id}", its folder is "${id}"`);
    const source = readFileSync(path.join(root, index), "utf8");
    const component = component_import(source);
    if (!component) throw new Error(`catalogue: ${index} has no \`component: () => import("…")\``);
    apps.push({
      data: manifest_data(manifest, meta, system),
      symbol: icon_symbol(id, render(manifest.icon, { props: {} }).body),
      index,
      component: path.posix.join(path.posix.dirname(index), component),
      source,
    });
  }
  return apps;
}

function own_hash(app: CollectedApp): string[] {
  return [JSON.stringify(app.data), app.symbol, app.source];
}

/** The dev server's and tests' catalogue: module URLs for chunks, no files, every app at the current release. */
export function dev_catalogue(apps: CollectedApp[], info: VersionInfo): Catalogue {
  const release = info.version;
  return {
    version: 1,
    core: "dev",
    build: info.buildTimestamp,
    release,
    apps: apps.map((app) => ({
      ...app.data,
      version: release,
      hash: sha(own_hash(app)),
      manifest: app.index,
      entry: app.component,
      files: [],
    })),
  };
}

const CHANGELOG = "src/lib/core/api/services/version/changelog.ts";

async function load_changelog(load: Load): Promise<ReleaseNote[]> {
  return ((await load(`/${CHANGELOG}`)) as { CHANGELOG: ReleaseNote[] }).CHANGELOG;
}

async function with_node_loader<T>(config: ResolvedConfig, run: (load: Load) => Promise<T>): Promise<T> {
  // Not the project's config file: its plugins would run their dev-server and close hooks a second time.
  const server = await createServer({
    root: config.root,
    configFile: false,
    mode: config.mode,
    plugins: [svelte()],
    resolve: { alias: config.resolve.alias },
    define: config.define,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    return await run((id) => server.ssrLoadModule(id));
  } finally {
    await server.close();
  }
}

function list_file(out_dir: string, name: string): string[] {
  const file = path.join(out_dir, "offline", `${name}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { files: string[] }).files : [];
}

/**
 * ADR-077 stage 2, build side: `store/catalogue.json` and `store/icons.svg` from every manifest, each manifest as its
 * own chunk, and the core hash and release notes for `version.json`. AppsService reads the catalogue and loads each
 * manifest chunk by URL (`src/lib/core/api/services/apps/source.ts`).
 */
export function catalogue_plugin(info: VersionInfo) {
  const previous_url = process.env.WEBOS_PREVIOUS_CATALOGUE ?? PREVIOUS_CATALOGUE;
  let config: ResolvedConfig;
  let dev: ViteDevServer | null = null;
  let collected: Promise<{ apps: CollectedApp[]; changelog: ReleaseNote[] }> | null = null;
  let previous: Promise<Catalogue | null> = Promise.resolve(null);
  let fields: VersionFields | null = null;
  const refs = new Map<string, string>();

  const plugin: Plugin = {
    name: "webos-catalogue",
    configResolved(resolved) {
      config = resolved;
    },
    buildStart() {
      if (config.command !== "build" || config.build.ssr) return;
      refs.clear();
      // Entries of their own, not implicit ones after `main`: Rollup orders implicit entries as they finish resolving,
      // which reorders core's mangled export names from one build of the same tree to the next.
      for (const app of app_dirs(config.root)) {
        refs.set(
          app.id,
          this.emitFile({
            type: "chunk",
            id: path.resolve(config.root, app.index),
            name: `${app.id}${MANIFEST_SUFFIX}`,
            preserveSignature: "strict",
          })
        );
      }
      collected = with_node_loader(config, async (load) => ({ apps: await collect_apps(config.root, load), changelog: await load_changelog(load) }));
      previous = fetch_previous(previous_url);
    },
    configureServer(server) {
      dev = server;
      const load: Load = (id) => server.ssrLoadModule(id);
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url !== `${config.base}store/catalogue.json` && url !== `${config.base}store/icons.svg`) return next();
        try {
          const apps = await collect_apps(config.root, load);
          const json = url.endsWith(".json");
          res.setHeader("Content-Type", json ? "application/json" : "image/svg+xml");
          res.setHeader("Cache-Control", "no-store");
          res.end(json ? JSON.stringify(dev_catalogue(apps, info)) : icon_sprite(apps.map((app) => app.symbol)));
        } catch (error) {
          next(error);
        }
      });
    },
    writeBundle: {
      sequential: true,
      order: "post",
      async handler(_, bundle) {
        if (!collected) return;
        const { apps, changelog } = await collected;
        const before = await previous;
        const out_dir = path.resolve(config.root, config.build.outDir);
        const normalize = content_normalizer(info);
        const read = (name: string) => readFileSync(path.join(out_dir, name));

        const chunk_of = (module: string) => {
          const chunks = Object.values(bundle).filter((file) => file.type === "chunk");
          const found = chunks.find((chunk) => chunk.facadeModuleId === module) ?? chunks.find((chunk) => chunk.moduleIds.includes(module));
          if (!found) throw new Error(`catalogue: no chunk holds ${module}`);
          return found.fileName;
        };

        const public_files = config.publicDir && existsSync(config.publicDir) ? readdirSync(config.publicDir).filter((name) => PRECACHED_PUBLIC.test(name)) : [];
        // The changelog gains a line every release, app-only ones included; the core hash must not move with it.
        const changelog_id = path.resolve(config.root, CHANGELOG);
        const notes_chunk = Object.values(bundle).find((file) => file.type === "chunk" && file.moduleIds.includes(changelog_id));
        if (notes_chunk?.type === "chunk" && notes_chunk.moduleIds.length > 1) {
          throw new Error(`catalogue: ${notes_chunk.fileName} holds more than the changelog, so the core hash would skip code`);
        }
        const core_files = list_file(out_dir, "core").filter((name) => name !== notes_chunk?.fileName);
        const core = sha([
          hash_files(core_files, read, normalize),
          hash_files(public_files, (name) => readFileSync(path.join(config.publicDir, name)), normalize),
        ]);

        const catalogue: Catalogue = {
          version: 1,
          core,
          build: info.buildTimestamp,
          release: info.version,
          apps: apps.map((app) => {
            const files = list_file(out_dir, app.data.id);
            const hash = sha([hash_files(files, read, normalize), ...own_hash(app)]);
            return {
              ...app.data,
              version: app_version(app.data.id, hash, before, info.version),
              hash,
              manifest: this.getFileName(refs.get(app.data.id)!),
              entry: chunk_of(path.resolve(config.root, app.component)),
              files,
            };
          }),
        };
        fields = { core, notes: release_notes(changelog, before?.release ?? null) };

        const dir = path.join(out_dir, "store");
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, "catalogue.json"), JSON.stringify(catalogue));
        writeFileSync(path.join(dir, "icons.svg"), icon_sprite(apps.map((app) => app.symbol)));
      },
    },
  };

  return {
    plugin,
    /** For `version.json`: the build's after `writeBundle`; the dev server's core is `dev`, its notes the top release. */
    version_fields: async (): Promise<VersionFields | null> => {
      if (fields) return fields;
      if (!dev) return null;
      const server = dev;
      return { core: "dev", notes: release_notes(await load_changelog((id) => server.ssrLoadModule(id)), null) };
    },
  };
}
