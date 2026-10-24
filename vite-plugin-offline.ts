import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Plugin, Rollup } from "vite";

export interface BundleFile {
  name: string;
  imports: string[];
  refs: string[];
}

export interface OfflineLists {
  core: string[];
  apps: Record<string, string[]>;
}

export interface OfflineListFile {
  build: number;
  files: string[];
}

/** Cached by their own runtime rules in `vite.config.ts` (or never), so never part of a list. */
export const RUNTIME_CACHED = /(\.(wasm|onnx|ttf|ttc|aff|dic)$)|(^assets\/mammoth-[^/]+\.js$)/;

const APP_INDEX = /\/apps\/(system|user)\/([^/]+)\/index\.ts$/;
const SHARED_CHUNKS = new Set(["core", "app-boot", "app-meta"]);
// Content-hashed file names (`name-HASH8.ext`), as a worker or a `new URL()` asset is named inside a file's source.
const HASHED_NAME = /[\w.-]+-[\w-]{8}\.[a-z0-9]+/g;

function reach(files: Map<string, BundleFile>, start: Iterable<string>, stop: (name: string) => boolean): Set<string> {
  const seen = new Set<string>();
  const queue = [...start];
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (seen.has(name) || stop(name)) continue;
    const file = files.get(name);
    if (!file) continue;
    seen.add(name);
    queue.push(...file.imports, ...file.refs);
  }
  return seen;
}

// Core is what boot reaches without entering a user app's lazy code, so every system app is in it.
export function offline_lists(files: BundleFile[], boot: string[], app_roots: Map<string, Set<string>>): OfflineLists {
  const by_name = new Map(files.map((file) => [file.name, file]));
  const roots = new Set([...app_roots.values()].flatMap((set) => [...set]));
  const core = reach(by_name, boot, (name) => roots.has(name));
  const keep = (name: string) => !core.has(name) && !RUNTIME_CACHED.test(name);

  const apps: Record<string, string[]> = {};
  for (const [id, own] of [...app_roots].sort(([a], [b]) => a.localeCompare(b))) {
    apps[id] = [...reach(by_name, own, (name) => core.has(name))].filter(keep).sort();
  }
  return { core: [...core].filter((name) => !RUNTIME_CACHED.test(name)).sort(), apps };
}

export function named_files(source: string, by_base: Map<string, string>): string[] {
  const found = new Set<string>();
  for (const [match] of source.matchAll(HASHED_NAME)) {
    const name = by_base.get(match);
    if (name) found.add(name);
  }
  return [...found];
}

// Vite's preload table lists the deps of every `import()` in a chunk, user apps' included; the chunk graph has them already.
const PRELOAD_TABLE = /m\.f\|\|\(m\.f=\[[^\]]*\]\)/g;

function to_bundle_files(bundle: Rollup.OutputBundle): BundleFile[] {
  const by_base = new Map(Object.keys(bundle).map((name) => [path.posix.basename(name), name]));
  return Object.values(bundle).map((file): BundleFile => {
    if (file.type === "chunk") {
      const meta = file.viteMetadata;
      const named = named_files(file.code.replace(PRELOAD_TABLE, ""), by_base).filter((name) => bundle[name]?.type === "asset");
      return {
        name: file.fileName,
        imports: [...file.imports, ...file.dynamicImports],
        refs: [...(meta?.importedCss ?? []), ...(meta?.importedAssets ?? []), ...named],
      };
    }
    const text = typeof file.source === "string" ? file.source : /\.(m?js|css|html)$/.test(file.fileName) ? new TextDecoder().decode(file.source) : "";
    return { name: file.fileName, imports: [], refs: named_files(text, by_base).filter((name) => name !== file.fileName) };
  });
}

// writeBundle sees final names (after the import map renames core); vite-plugin-pwa builds sw.js later, in closeBundle.
export function offline_plugin(build: number) {
  let out_dir = "dist";
  let core = new Set<string>();

  const plugin: Plugin = {
    name: "webos-offline-lists",
    apply: "build",
    configResolved(config) {
      out_dir = path.resolve(config.root, config.build.outDir);
    },
    writeBundle(_, bundle) {
      const app_roots = new Map<string, Set<string>>();
      const chunk_of = new Map<string, string>();
      for (const file of Object.values(bundle)) {
        if (file.type === "chunk") for (const id of file.moduleIds) chunk_of.set(id, file.fileName);
      }
      for (const id of chunk_of.keys()) {
        const match = APP_INDEX.exec(id);
        if (!match || match[1] !== "user") continue;
        const own = new Set<string>();
        for (const lazy of this.getModuleInfo(id)?.dynamicallyImportedIds ?? []) {
          const chunk = chunk_of.get(lazy);
          const shared = chunk && bundle[chunk]?.type === "chunk" && SHARED_CHUNKS.has((bundle[chunk] as Rollup.OutputChunk).name);
          if (chunk && !shared) own.add(chunk);
        }
        app_roots.set(match[2], own);
      }

      const boot = Object.values(bundle)
        .filter((file) => file.fileName === "index.html" || (file.type === "chunk" && file.isEntry))
        .map((file) => file.fileName);
      const lists = offline_lists(to_bundle_files(bundle), boot, app_roots);
      core = new Set(lists.core);

      const dir = path.join(out_dir, "offline");
      mkdirSync(dir, { recursive: true });
      const write = (name: string, files: string[]) =>
        writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ build, files } satisfies OfflineListFile));
      write("core", lists.core);
      for (const [id, files] of Object.entries(lists.apps)) write(id, files);
    },
  };

  return {
    plugin,
    precached: (url: string) => !url.startsWith("assets/") || core.has(url),
  };
}
