import { createHash } from "node:crypto";
import path from "node:path";
import type { Plugin, Rollup } from "vite";

const PREFIX = "@webos/";
const CORE = `${PREFIX}core`;

type Output = Rollup.RenderedChunk | Rollup.OutputChunk | Rollup.OutputAsset;

function short_hash(text: string): string {
  return createHash("sha256").update(text).digest("base64url").slice(0, 8);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function find_core<T extends Output>(files: T[], name: string): Exclude<T, Rollup.OutputAsset> | null {
  const found = files.filter(
    (file) => (!("type" in file) || file.type === "chunk") && "facadeModuleId" in file && file.name === name && file.facadeModuleId === null
  );
  return found.length === 1 ? (found[0] as Exclude<T, Rollup.OutputAsset>) : null;
}

/**
 * A chunk's Rollup hash covers the hashes of every chunk it names, and nearly every chunk imports `core`: any core change
 * renamed ~575 precached files. Here every chunk imports core as `@webos/core`, resolved by an import map in
 * `index.html`, and core's own lazy imports and preload list (`__vite__mapDeps`) name their targets the same way, so a
 * change renames only what changed, plus `index.html`. Core then no longer has an honest Rollup hash, so it is renamed
 * from its final code: a precached hashed file must never change content under the same name.
 */
export function import_map_plugin(name = "core"): Plugin[] {
  let root = process.cwd();
  let base = "/";
  let core_file: string | null = null;
  let core_css = new Set<string>();
  const specs = new Map<string, string>();
  const mapped = new Map<string, string>();

  const spec_of = (file: string) => {
    const spec = file === core_file ? CORE : specs.get(file);
    if (spec && spec !== CORE) mapped.set(spec, file);
    return spec;
  };

  const collect: Plugin = {
    name: "webos-import-map",
    apply: "build",
    config() {
      return {
        experimental: {
          renderBuiltUrl(filename, { hostId, hostType }) {
            if (hostType !== "js" || !core_file) return;
            if (hostId !== core_file && filename !== core_file && !core_css.has(filename)) return;
            const spec = spec_of(filename);
            return spec ? { runtime: `import.meta.resolve(${JSON.stringify(spec)})` } : undefined;
          },
        },
      };
    },
    configResolved(config) {
      root = config.root;
      base = config.base;
    },
    renderStart() {
      core_file = null;
      core_css = new Set();
      specs.clear();
      mapped.clear();
    },
    renderChunk: {
      order: "post",
      handler(code, chunk, _, { chunks }) {
        const core = find_core(Object.values(chunks), name);
        if (!core) this.error(`import map: expected one manual chunk named "${name}"`);
        if (chunk.fileName === core.fileName) return null;
        const relative = "./" + path.posix.relative(path.posix.dirname(chunk.fileName), core.fileName);
        const rewritten = code.replace(new RegExp(`(["'\`])${escape(relative)}\\1`, "g"), JSON.stringify(CORE));
        return rewritten === code ? null : { code: rewritten, map: null };
      },
    },
    // Before Vite writes the preload lists, which ask `renderBuiltUrl` for these specifiers.
    generateBundle: {
      order: "pre",
      handler(_, bundle) {
        const core = find_core(Object.values(bundle), name);
        if (!core) this.error(`import map: expected one manual chunk named "${name}"`);
        core_file = core.fileName;
        core_css = new Set(core.viteMetadata?.importedCss ?? []);

        const chunks = Object.values(bundle)
          .filter((file): file is Rollup.OutputChunk => file.type === "chunk")
          .map((chunk) => {
            const owned = chunk.facadeModuleId ? [chunk.facadeModuleId] : [...chunk.moduleIds].sort();
            const identity = short_hash(owned.map((id) => path.relative(root, id).split(path.sep).join("/")).join("\n"));
            return { chunk, identity };
          })
          .sort((a, b) => a.identity.localeCompare(b.identity));
        for (const { chunk, identity } of chunks) {
          const stem = chunk === core ? CORE : `${PREFIX}${chunk.name}.${identity}`;
          specs.set(chunk.fileName, `${stem}.js`);
          const css = [...(chunk.viteMetadata?.importedCss ?? [])].filter((file) => !specs.has(file)).sort();
          css.forEach((file, index) => specs.set(file, `${stem}${index === 0 ? "" : `.${index}`}.css`));
        }
      },
    },
  };

  const apply: Plugin = {
    name: "webos-import-map-apply",
    apply: "build",
    generateBundle: {
      order: "post",
      handler(_, bundle) {
        if (!core_file) return;
        const core = bundle[core_file];
        const html = bundle["index.html"];
        if (core?.type !== "chunk" || html?.type !== "asset" || typeof html.source !== "string") {
          this.error("import map: core chunk or index.html missing");
        }

        const dir = path.posix.dirname(core_file);
        core.code = core.code.replace(/\bimport\((["'`])\.\/([^"'`]+)\1\)/g, (match, _quote, file: string) => {
          const spec = spec_of(path.posix.join(dir, file));
          return spec ? `import(${JSON.stringify(spec)})` : match;
        });

        const renamed = path.posix.join(dir, `${name}-${short_hash(core.code)}.js`);
        delete bundle[core_file];
        core.fileName = renamed;
        bundle[renamed] = core;
        for (const file of Object.values(bundle)) {
          if (file.type !== "chunk") continue;
          file.imports = file.imports.map((imported) => (imported === core_file ? renamed : imported));
          file.dynamicImports = file.dynamicImports.map((imported) => (imported === core_file ? renamed : imported));
        }

        const imports: Record<string, string> = { [CORE]: base + renamed };
        for (const [spec, file] of [...mapped].sort(([a], [b]) => a.localeCompare(b))) imports[spec] = base + file;
        const source = html.source.replaceAll(base + core_file, base + renamed);
        const at = source.search(/<script\b|<link rel="modulepreload"/);
        if (at === -1) this.error("import map: no script in index.html");
        html.source = source.slice(0, at) + `<script type="importmap">${JSON.stringify({ imports })}</script>` + "\n    " + source.slice(at);
        core_file = renamed;
      },
    },
  };

  return [collect, apply];
}
