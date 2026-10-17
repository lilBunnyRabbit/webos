import { list_directory } from "./opfs";
import { join_path, split_path } from "./path";
import type { SizeNode } from "./type";

interface Listing {
  revision: number;
  files: SizeNode[];
  directories: { name: string; handle: FileSystemDirectoryHandle }[];
}

/** Per-folder listings reused while the folder's revision (ADR-021) holds, so a repeated walk re-lists only what changed. */
export class SizeCache {
  private listings = new Map<string, Listing>();

  constructor(private readonly revision_of: (path: string) => number) {}

  async tree(handle: FileSystemDirectoryHandle, path: string, depth = Infinity): Promise<SizeNode> {
    const segments = split_path(path);
    const listing = await this.listing(handle, join_path(segments));
    const directories = await Promise.all(
      listing.directories.map((directory) => this.tree(directory.handle, join_path(segments, directory.name), depth - 1))
    );
    const children = [...directories, ...listing.files.map((file) => ({ ...file }))];
    const size = children.reduce((sum, child) => sum + child.size, 0);
    const node: SizeNode = { name: segments.at(-1) ?? "/", path: join_path(segments), size };
    if (depth > 0) node.children = children.sort((a, b) => b.size - a.size);
    return node;
  }

  private async listing(handle: FileSystemDirectoryHandle, path: string): Promise<Listing> {
    const revision = this.revision_of(path);
    const cached = this.listings.get(path);
    if (cached?.revision === revision) return cached;

    // Deleting or moving a folder bumps only its parent, and a folder made again under the same name keeps the old
    // revision (OPFS `isSameEntry` compares paths too), so a changed folder drops what it holds.
    const prefix = path === "/" ? "/" : `${path}/`;
    for (const key of this.listings.keys()) if (key !== path && key.startsWith(prefix)) this.listings.delete(key);

    const items = await list_directory(handle, { include_metadata: true });
    const listing: Listing = { revision, files: [], directories: [] };
    for (const item of items) {
      if (item.kind === "directory") listing.directories.push({ name: item.name, handle: item.handle });
      else listing.files.push({ name: item.name, path: join_path(split_path(path), item.name), size: item.size ?? 0 });
    }
    this.listings.set(path, listing);
    return listing;
  }
}
