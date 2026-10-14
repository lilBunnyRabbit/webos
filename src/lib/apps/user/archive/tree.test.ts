import { describe, expect, it } from "vitest";
import { build_tree, entries_to_extract, folder_keys, format_ratio, is_covered, visible_rows } from "./tree";
import { safe_segments } from "./zip-format";
import type { ZipEntry } from "./zip-read";

function entry(name: string, size = 0, compressed_size = size): ZipEntry {
  return {
    name,
    path: safe_segments(name),
    directory: name.endsWith("/"),
    method: 8,
    flags: 0,
    crc: 0,
    compressed_size,
    size,
    modified: new Date(2024, 0, 1),
    local_offset: 0,
    encrypted: false,
  };
}

const ENTRIES = [entry("b.txt", 10, 5), entry("docs/"), entry("docs/z.md", 100, 40), entry("docs/a/deep.txt", 50, 50), entry("../evil.txt", 1), entry("./")];

describe("build_tree", () => {
  const root = build_tree(ENTRIES);

  it("nests entries, adds implied folders, and puts folders first", () => {
    expect(root.children.map((node) => node.name)).toEqual(["docs", "b.txt", "evil.txt"]);
    const docs = root.children[0];
    expect(docs.entry?.name).toBe("docs/");
    expect(docs.children.map((node) => [node.name, node.directory, node.entry === null])).toEqual([
      ["a", true, true],
      ["z.md", false, false],
    ]);
  });

  it("sums sizes and file counts up the folders", () => {
    expect(root.children[0]).toMatchObject({ size: 150, compressed_size: 90, files: 2 });
    expect(root).toMatchObject({ size: 161, files: 4 });
  });

  it("lists rows of expanded folders only", () => {
    expect(visible_rows(root, new Set()).map((row) => row.node.key)).toEqual(["docs", "b.txt", "evil.txt"]);
    expect(visible_rows(root, new Set(["docs", "docs/a"])).map((row) => [row.node.key, row.depth])).toEqual([
      ["docs", 0],
      ["docs/a", 1],
      ["docs/a/deep.txt", 2],
      ["docs/z.md", 1],
      ["b.txt", 0],
      ["evil.txt", 0],
    ]);
    expect(folder_keys(root)).toEqual(["docs", "docs/a"]);
  });
});

describe("selection", () => {
  it("covers everything under a selected folder", () => {
    const selected = new Set(["docs/a"]);
    expect(is_covered("docs/a/deep.txt", selected)).toBe(true);
    expect(is_covered("docs/z.md", selected)).toBe(false);
    expect(is_covered("docs/ab", selected)).toBe(false);
  });

  it("extracts folders first and skips names with no safe path", () => {
    expect(entries_to_extract(ENTRIES).map((e) => e.name)).toEqual(["docs/", "b.txt", "../evil.txt", "docs/z.md", "docs/a/deep.txt"]);
    expect(entries_to_extract(ENTRIES, new Set(["docs"])).map((e) => e.name)).toEqual(["docs/", "docs/z.md", "docs/a/deep.txt"]);
  });
});

describe("format_ratio", () => {
  it("shows the share saved", () => {
    expect(format_ratio(100, 40)).toBe("60%");
    expect(format_ratio(10, 12)).toBe("-20%");
    expect(format_ratio(0, 0)).toBe("—");
  });
});
