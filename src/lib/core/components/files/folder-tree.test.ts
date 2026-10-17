import { describe, expect, test } from "vitest";
import { folder_from_files, top_level_groups } from "./folder-tree";

function picked(path: string, text = "x"): File {
  const file = new File([text], path.split("/").at(-1)!);
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

describe("folder_from_files", () => {
  test("splits webkitRelativePath into the folder name, file paths and subfolders", () => {
    const folder = folder_from_files([picked("Photos/a.png"), picked("Photos/2024/b.png"), picked("Photos/2024/x/c.png")])!;
    expect(folder.name).toBe("Photos");
    expect(folder.files.map((entry) => entry.path)).toEqual([["a.png"], ["2024", "b.png"], ["2024", "x", "c.png"]]);
    expect(folder.folders).toEqual([["2024"], ["2024", "x"]]);
  });

  test("nothing picked is no folder", () => {
    expect(folder_from_files([])).toBe(null);
  });
});

describe("top_level_groups", () => {
  test("one group per top-level entry, in natural name order, with its size", () => {
    const folder = folder_from_files([picked("P/b10/x.txt", "abc"), picked("P/b2/y.txt", "de"), picked("P/a.txt", "f")])!;
    const groups = top_level_groups({ ...folder, folders: [...folder.folders, ["empty"]] });
    expect(groups.map((group) => [group.name, group.directory, group.size])).toEqual([
      ["a.txt", false, 1],
      ["b2", true, 2],
      ["b10", true, 3],
      ["empty", true, 0],
    ]);
  });
});
