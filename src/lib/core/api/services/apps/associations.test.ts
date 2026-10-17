import { describe, expect, test } from "vitest";
import type { AppManifest } from "./type";
import { apps_for, association_tier, best_apps_for, file_extension, has_compound_match, tools_for } from "./associations";

const app = (id: string, associations: string[] = [], tools: string[] = []) =>
  ({ id, name: id, associations, tools }) as unknown as AppManifest;

const txt = { name: "Notes.TXT", type: "text/plain" };

describe("file_extension", () => {
  test("lowercases the last extension", () => {
    expect(file_extension("Notes.TXT")).toBe(".txt");
    expect(file_extension("a.tar.gz")).toBe(".gz");
  });

  test("a dotfile is its own extension, no dot means none", () => {
    expect(file_extension(".env")).toBe(".env");
    expect(file_extension("Makefile")).toBe("");
  });
});

describe("association_tier", () => {
  test("extension 3, exact MIME 2, wildcard 1, else 0", () => {
    expect(association_tier(".txt", txt)).toBe(3);
    expect(association_tier("text/plain", txt)).toBe(2);
    expect(association_tier("text/*", txt)).toBe(1);
    expect(association_tier("image/*", txt)).toBe(0);
  });

  test("a compound extension matches the end of the name and outranks a plain one", () => {
    const form = { name: "Survey.Form.md", type: "text/markdown" };
    expect(association_tier(".form.md", form)).toBe(4);
    expect(association_tier(".md", form)).toBe(3);
    expect(association_tier(".form.md", { name: "notes.md", type: "text/markdown" })).toBe(0);
    expect(association_tier(".form.md", { name: "form.md", type: "text/markdown" })).toBe(0);
  });

  test("MIME patterns never match a file without a type", () => {
    expect(association_tier("text/*", { name: "x", type: "" })).toBe(0);
  });
});

describe("has_compound_match", () => {
  test("only a compound entry that matches counts", () => {
    const apps = [app("editor", [".md", "text/*"]), app("forms", [".form.md"])];
    expect(has_compound_match(apps, { name: "a.form.md", type: "" })).toBe(true);
    expect(has_compound_match(apps, { name: "a.md", type: "" })).toBe(false);
    expect(best_apps_for(apps, { name: "a.form.md", type: "text/markdown" }).map((a) => a.id)).toEqual(["forms"]);
  });
});

describe("best_apps_for", () => {
  test("keeps only the apps tied on the best tier", () => {
    const apps = [app("viewer", ["text/*"]), app("editor", [".txt"]), app("other", [".txt"])];
    expect(best_apps_for(apps, txt).map((a) => a.id)).toEqual(["editor", "other"]);
  });

  test("empty when nothing matches", () => {
    expect(best_apps_for([app("img", ["image/*"])], txt)).toEqual([]);
  });
});

describe("apps_for and tools_for", () => {
  test("apps_for sorts by tier, then name", () => {
    const apps = [app("b", ["text/*"]), app("a", ["text/*"]), app("c", [".txt"])];
    expect(apps_for(apps, txt).map((a) => a.id)).toEqual(["c", "a", "b"]);
  });

  test("tools_for skips apps already associated", () => {
    const apps = [app("viewer", [".txt"], ["text/*"]), app("tool", [], ["text/*"])];
    expect(tools_for(apps, txt).map((a) => a.id)).toEqual(["tool"]);
  });

  test("\"*\" in tools offers the app for every file, typed or not", () => {
    const apps = [app("hex", [], ["*"])];
    expect(tools_for(apps, txt).map((a) => a.id)).toEqual(["hex"]);
    expect(tools_for(apps, { name: "blob.bin", type: "" }).map((a) => a.id)).toEqual(["hex"]);
  });

  test("\"*\" in associations matches nothing, so it can never become a default", () => {
    const apps = [app("greedy", ["*"])];
    expect(best_apps_for(apps, txt)).toEqual([]);
    expect(apps_for(apps, txt)).toEqual([]);
  });
});
