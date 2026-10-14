import type { ZipSource } from "./zip-write";

export interface CreateItem {
  id: string;
  name: string;
  directory: boolean;
  /** Where it came from: an OPFS path, or `null` for a file from the device. */
  path: string | null;
  size: number;
  files: number;
  sources: ZipSource[];
}

export function stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function base_name(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function parent_path(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

export function unique_name(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 1; ; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function archive_name(items: CreateItem[]): string {
  return items.length === 1 ? `${items[0].directory ? items[0].name : stem(items[0].name)}.zip` : "Archive.zip";
}

export function rename_sources(sources: ZipSource[], from: string, to: string): ZipSource[] {
  if (from === to) return sources;
  return sources.map((source) => ({
    ...source,
    name: source.name === from ? to : `${to}${source.name.slice(from.length)}`,
  }));
}

export function all_sources(items: CreateItem[]): ZipSource[] {
  return items.flatMap((item) => item.sources);
}
