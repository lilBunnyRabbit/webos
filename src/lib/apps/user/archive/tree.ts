import type { ZipEntry } from "$lib/core/utils/zip/read";

export interface TreeNode {
  name: string;
  key: string;
  directory: boolean;
  /** `null` for a folder only implied by its files' names. */
  entry: ZipEntry | null;
  children: TreeNode[];
  size: number;
  compressed_size: number;
  files: number;
}

export interface TreeRow {
  node: TreeNode;
  depth: number;
}

function folder(name: string, key: string): TreeNode {
  return { name, key, directory: true, entry: null, children: [], size: 0, compressed_size: 0, files: 0 };
}

export function build_tree(entries: ZipEntry[]): TreeNode {
  const root = folder("", "");
  const folders = new Map<string, TreeNode>([["", root]]);

  const folder_at = (segments: string[]): TreeNode => {
    const key = segments.join("/");
    const known = folders.get(key);
    if (known) return known;
    const node = folder(segments.at(-1)!, key);
    folder_at(segments.slice(0, -1)).children.push(node);
    folders.set(key, node);
    return node;
  };

  for (const entry of entries) {
    if (!entry.path.length) continue;
    if (entry.directory) {
      folder_at(entry.path).entry = entry;
      continue;
    }
    const parent = folder_at(entry.path.slice(0, -1));
    parent.children.push({
      name: entry.path.at(-1)!,
      key: entry.path.join("/"),
      directory: false,
      entry,
      children: [],
      size: entry.size,
      compressed_size: entry.compressed_size,
      files: 1,
    });
  }

  total(root);
  return root;
}

function total(node: TreeNode): void {
  if (!node.directory) return;
  node.children.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  for (const child of node.children) {
    total(child);
    node.size += child.size;
    node.compressed_size += child.compressed_size;
    node.files += child.files;
  }
}

export function visible_rows(root: TreeNode, expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (node: TreeNode, depth: number) => {
    for (const child of node.children) {
      rows.push({ node: child, depth });
      if (child.directory && expanded.has(child.key)) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

export function folder_keys(root: TreeNode): string[] {
  const keys: string[] = [];
  const walk = (node: TreeNode) => {
    for (const child of node.children) {
      if (!child.directory) continue;
      keys.push(child.key);
      walk(child);
    }
  };
  walk(root);
  return keys;
}

export function is_covered(key: string, selected: ReadonlySet<string>): boolean {
  if (selected.has(key)) return true;
  for (let i = key.lastIndexOf("/"); i > 0; i = key.lastIndexOf("/", i - 1)) {
    if (selected.has(key.slice(0, i))) return true;
  }
  return false;
}

export function entries_to_extract(entries: ZipEntry[], selected?: ReadonlySet<string>): ZipEntry[] {
  return entries
    .filter((entry) => entry.path.length && (!selected || is_covered(entry.path.join("/"), selected)))
    .sort((a, b) => Number(b.directory) - Number(a.directory) || a.path.length - b.path.length);
}

export function saved_ratio(size: number, compressed_size: number): number {
  return size === 0 ? 0 : 1 - compressed_size / size;
}

export function format_ratio(size: number, compressed_size: number): string {
  if (size === 0) return "—";
  return `${Math.round(saved_ratio(size, compressed_size) * 100)}%`;
}
