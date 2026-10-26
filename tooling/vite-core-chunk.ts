import path from "path";
import type { Rollup } from "vite";

type Program = NonNullable<Rollup.ModuleInfo["ast"]>;
type Statement = Program["body"][number];

/** A name another module asks for: an export, `*` for all of them, or `""` when it is only evaluated. */
type Request = string;

interface Shape {
  /** Has code of its own; a module of only re-exports is a barrel and passes requests on instead. */
  code: boolean;
  imports: { id: string; names: Request[] }[];
  reexports: Map<string, { id: string; name: Request }>;
  stars: string[];
}

function source_of(statement: Statement): string | null {
  if (statement.type === "ImportDeclaration" || statement.type === "ExportAllDeclaration") return String(statement.source.value);
  if (statement.type === "ExportNamedDeclaration" && statement.source) return String(statement.source.value);
  return null;
}

function name_of(node: { type: string; name?: string; value?: unknown }): string {
  return node.type === "Identifier" ? node.name! : String(node.value);
}

// Rollup lists `importedIds` in the order each source first appears, so the AST's sources line up with them.
function shape_of(info: Rollup.ModuleInfo): Shape | null {
  if (!info.ast) return null;
  const sources: string[] = [];
  for (const statement of info.ast.body) {
    const source = source_of(statement);
    if (source !== null && !sources.includes(source)) sources.push(source);
  }
  if (sources.length !== info.importedIds.length) return null;
  const resolve = (statement: Statement) => info.importedIds[sources.indexOf(source_of(statement)!)];

  const shape: Shape = { code: false, imports: [], reexports: new Map(), stars: [] };
  for (const statement of info.ast.body) {
    if (statement.type === "ImportDeclaration") {
      const names = statement.specifiers.map((specifier) =>
        specifier.type === "ImportSpecifier"
          ? name_of(specifier.imported)
          : specifier.type === "ImportDefaultSpecifier"
            ? "default"
            : "*"
      );
      shape.imports.push({ id: resolve(statement), names: names.length > 0 ? names : [""] });
    } else if (statement.type === "ExportAllDeclaration") {
      if (statement.exported) shape.reexports.set(name_of(statement.exported), { id: resolve(statement), name: "*" });
      else shape.stars.push(resolve(statement));
    } else if (statement.type === "ExportNamedDeclaration" && statement.source) {
      for (const specifier of statement.specifiers) {
        shape.reexports.set(name_of(specifier.exported), { id: resolve(statement), name: name_of(specifier.local) });
      }
    } else {
      shape.code = true;
    }
  }
  return shape;
}

/**
 * The modules the boot code uses, minus everything that reaches app code, the app registry or the build stamp, for one
 * `core` chunk. A chunk's hash covers the names of the chunks it imports, and nearly every app imports the kernel, kit
 * and Svelte from the boot chunk: with the registry and the stamp in that chunk, one changed app or a version bump
 * renamed almost every precached file.
 *
 * It follows imported names through barrels. Taking whole barrels (or Rollup's own closure of a barrel, which counts
 * every export some app uses) pulls the kit and the icons into boot.
 */
export function core_modules(get: Rollup.GetModuleInfo, entry: string, volatile_roots: string[], apps_dir: string): Set<string> {
  const apps = path.resolve(apps_dir) + path.sep;
  const roots = new Set(volatile_roots.map((file) => path.resolve(file)));

  const seen = new Set<string>();
  const marked: string[] = [];
  const walk = [entry];
  while (walk.length > 0) {
    const id = walk.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const info = get(id);
    if (!info) continue;
    if (roots.has(id) || id.startsWith(apps)) marked.push(id);
    walk.push(...info.importedIds, ...info.dynamicallyImportedIds);
  }

  const volatile = new Set<string>();
  while (marked.length > 0) {
    const id = marked.pop()!;
    if (volatile.has(id)) continue;
    volatile.add(id);
    const info = get(id);
    if (info) marked.push(...info.importers, ...info.dynamicImporters);
  }

  const shapes = new Map<string, Shape | null>();
  const shape = (id: string) => {
    if (!shapes.has(id)) {
      const info = get(id);
      shapes.set(id, info ? shape_of(info) : null);
    }
    return shapes.get(id)!;
  };

  const core = new Set<string>();
  const entered = new Set<string>();
  const asked = new Map<string, Set<Request>>();
  const queue: [string, Request][] = [[entry, ""]];

  const enter = (id: string, info: Rollup.ModuleInfo, own: Shape | null) => {
    if (entered.has(id)) return;
    entered.add(id);
    if (id !== entry && !volatile.has(id) && info.isIncluded !== false) core.add(id);
    if (!own) {
      for (const imported of info.importedIds) queue.push([imported, "*"]);
      return;
    }
    for (const { id: imported, names } of own.imports) for (const name of names) queue.push([imported, name]);
  };

  while (queue.length > 0) {
    const [id, request] = queue.pop()!;
    const done = asked.get(id) ?? new Set<Request>();
    if (done.has(request) || done.has("*")) continue;
    done.add(request);
    asked.set(id, done);

    const info = get(id);
    if (!info) continue;
    const own = shape(id);
    if (!own || own.code || id === entry) enter(id, info, own);
    if (!own) continue;

    if (request === "*") {
      for (const { id: from, name } of own.reexports.values()) queue.push([from, name]);
      for (const from of own.stars) queue.push([from, "*"]);
    } else if (request === "") {
      for (const { id: from } of own.reexports.values()) queue.push([from, ""]);
      for (const from of own.stars) queue.push([from, ""]);
    } else if (own.reexports.has(request)) {
      const { id: from, name } = own.reexports.get(request)!;
      queue.push([from, name]);
    } else {
      for (const from of own.stars) {
        const exports = get(from)?.exports;
        if (!exports || exports.includes(request)) queue.push([from, request]);
      }
    }
  }
  return core;
}
