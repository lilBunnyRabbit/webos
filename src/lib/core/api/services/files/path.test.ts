import { describe, expect, test } from "vitest";
import {
  base_name,
  file_extension,
  file_stem,
  join_path,
  parent_path,
  resolve_path,
  split_path,
  tilde_path,
} from "./path";

describe("path", () => {
  test("split drops empty segments", () => {
    expect(split_path("/docs/a.txt")).toEqual(["docs", "a.txt"]);
    expect(split_path("//docs/")).toEqual(["docs"]);
    expect(split_path("/")).toEqual([]);
  });

  test("join builds an absolute path", () => {
    expect(join_path([])).toBe("/");
    expect(join_path(["docs"], "a.txt")).toBe("/docs/a.txt");
  });

  test("split then join normalises", () => {
    expect(join_path(split_path("//home//Desktop/"))).toBe("/home/Desktop");
  });

  test("resolve_path handles ~, relative, . and ..", () => {
    expect(resolve_path("/home/Pictures", "a.png")).toBe("/home/Pictures/a.png");
    expect(resolve_path("/home/Pictures", "../Music/./x")).toBe("/home/Music/x");
    expect(resolve_path("/etc", "~")).toBe("/home");
    expect(resolve_path("/etc", "~/Desktop/")).toBe("/home/Desktop");
    expect(resolve_path("/home", "/../..")).toBe("/");
    expect(resolve_path("/home", "~x")).toBe("/home/~x");
  });

  test("tilde_path shortens /home", () => {
    expect(tilde_path("/home")).toBe("~");
    expect(tilde_path("/home/Desktop")).toBe("~/Desktop");
    expect(tilde_path("/homeless")).toBe("/homeless");
  });

  test("base_name is the last segment", () => {
    expect(base_name("/home/a/b.pdf")).toBe("b.pdf");
    expect(base_name("/b.pdf")).toBe("b.pdf");
    expect(base_name("b.pdf")).toBe("b.pdf");
    expect(base_name("/")).toBe("");
  });

  test("parent_path stops at the root", () => {
    expect(parent_path("/home/a/b.pdf")).toBe("/home/a");
    expect(parent_path("/b.pdf")).toBe("/");
    expect(parent_path("/")).toBe("/");
  });

  test("file_stem drops the last extension, dotfiles keep their name", () => {
    expect(file_stem("a.tar.gz")).toBe("a.tar");
    expect(file_stem("photo.PNG")).toBe("photo");
    expect(file_stem("Makefile")).toBe("Makefile");
    expect(file_stem(".env")).toBe(".env");
  });

  test("file_extension is lowercase with the dot, a dotfile is its own extension", () => {
    expect(file_extension("Notes.TXT")).toBe(".txt");
    expect(file_extension("a.tar.gz")).toBe(".gz");
    expect(file_extension(".env")).toBe(".env");
    expect(file_extension("Makefile")).toBe("");
  });
});
