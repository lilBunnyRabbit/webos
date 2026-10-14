import { describe, expect, it } from "vitest";
import { archive_name, base_name, parent_path, rename_sources, stem, unique_name, type CreateItem } from "./create";

const item = (name: string, directory = false): CreateItem => ({ id: name, name, directory, path: null, size: 0, files: 0, sources: [] });

describe("create helpers", () => {
  it("names the archive after a single item", () => {
    expect(archive_name([item("report.pdf")])).toBe("report.zip");
    expect(archive_name([item("Photos", true)])).toBe("Photos.zip");
    expect(archive_name([item("a.txt"), item("b.txt")])).toBe("Archive.zip");
  });

  it("finds a free name", () => {
    expect(unique_name("a.txt", new Set())).toBe("a.txt");
    expect(unique_name("a.txt", new Set(["a.txt", "a (1).txt"]))).toBe("a (2).txt");
    expect(unique_name("Photos", new Set(["Photos"]))).toBe("Photos (1)");
  });

  it("renames a folder's sources under a new top name", () => {
    const sources = [{ name: "Photos", directory: true }, { name: "Photos/a.png" }];
    expect(rename_sources(sources, "Photos", "Photos (1)").map((source) => source.name)).toEqual(["Photos (1)", "Photos (1)/a.png"]);
  });

  it("splits paths", () => {
    expect(stem(".hidden")).toBe(".hidden");
    expect(stem("a.tar.gz")).toBe("a.tar");
    expect(base_name("/home/a.zip")).toBe("a.zip");
    expect(parent_path("/home/a.zip")).toBe("/home");
    expect(parent_path("/a.zip")).toBe("/");
  });
});
