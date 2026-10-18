import { describe, expect, test } from "vitest";
import { AppCategory, type AppManifest } from "$lib/core/api/services/apps/type";
import type { Command } from "$lib/core/api/services/shell/type";
import { ChangeKind, type Release } from "$lib/core/api/services/version/type";
import {
  app_commands,
  app_file_types,
  app_story,
  category_counts,
  category_of,
  has_filter,
  library_sections,
  LibraryCategory,
  LibraryFilter,
  LibrarySort,
  showcase_sections,
} from "./library";

const app = (name: string, extra: Partial<AppManifest> = {}) =>
  ({ id: name.toLowerCase().replace(/\s+/g, "-"), name, category: AppCategory.UTILITIES, system: false, ...extra }) as AppManifest;

const command = (id: string, app?: string) => ({ id, description: id, app, run() {} }) as Command;
const COMMANDS = [command("note add", "quick-notes"), command("note", "quick-notes"), command("ls")];

const APPS = [
  app("Snake", { category: AppCategory.GAMES }),
  app("Sudoku", { category: AppCategory.GAMES, widget: async () => ({ default: (() => {}) as never }) }),
  app("Calculator"),
  app("Text Editor", { system: true, category: AppCategory.DEVELOPER, associations: ["text/*", ".md"] }),
  app("Quick Notes", { category: AppCategory.PRODUCTIVITY, shell: async () => ({ default: {} }) }),
  app("Diff", { category: AppCategory.DEVELOPER, tools: [".txt"] }),
];

const BASE = { query: "", category: LibraryCategory.ALL, filters: [], used: new Set<string>(), installed: new Set<string>(), sort: LibrarySort.NAME } as const;
const names = (sections: { apps: AppManifest[] }[]) => sections.flatMap((section) => section.apps.map((manifest) => manifest.name));

describe("category_of", () => {
  test("system apps are System whatever their category", () => {
    expect(category_of(APPS[3])).toBe(LibraryCategory.SYSTEM);
    expect(category_of(APPS[0])).toBe(AppCategory.GAMES);
  });
});

describe("has_filter", () => {
  const used = new Set(["snake"]);
  const context = { used, installed: new Set(APPS.map((manifest) => manifest.id).filter((id) => id !== "diff")) };
  test("widget, files (associations or tools), commands, used and not installed", () => {
    expect(APPS.filter((manifest) => has_filter(manifest, LibraryFilter.WIDGET, context)).map((m) => m.id)).toEqual(["sudoku"]);
    expect(APPS.filter((manifest) => has_filter(manifest, LibraryFilter.FILES, context)).map((m) => m.id)).toEqual(["text-editor", "diff"]);
    expect(APPS.filter((manifest) => has_filter(manifest, LibraryFilter.COMMANDS, context)).map((m) => m.id)).toEqual(["quick-notes"]);
    expect(APPS.filter((manifest) => has_filter(manifest, LibraryFilter.USED, context)).map((m) => m.id)).toEqual(["snake"]);
    expect(APPS.filter((manifest) => has_filter(manifest, LibraryFilter.NOT_INSTALLED, context)).map((m) => m.id)).toEqual(["diff"]);
  });

  test("empty lists don't count", () => {
    expect(has_filter(app("X", { associations: [], tools: [] }), LibraryFilter.FILES, context)).toBe(false);
  });
});

describe("library_sections", () => {
  test("recent sort: one section per release by its newest mention, unmentioned apps last", () => {
    const changelog: Release[] = [
      { version: "0.3.0", date: "2026-01-03", title: "Fixes", changes: [{ kind: ChangeKind.FIXED, apps: ["snake"], text: "x" }] },
      { version: "0.2.0", date: "2026-01-02", title: "Games", introduces: ["sudoku", "snake"], changes: [{ kind: ChangeKind.NEW, apps: ["sudoku", "snake"], text: "x" }] },
      { version: "0.1.0", date: "2026-01-01", title: "Tools", introduces: ["calculator"], changes: [{ kind: ChangeKind.NEW, apps: ["calculator"], text: "x" }] },
    ];
    const sections = library_sections(APPS, { ...BASE, sort: LibrarySort.RECENT, changelog });
    expect(sections.map((section) => [section.label, section.apps.map((manifest) => manifest.id)])).toEqual([
      ["v0.3.0 · Fixes", ["snake"]],
      ["v0.2.0 · Games", ["sudoku"]],
      ["v0.1.0 · Tools", ["calculator"]],
      ["Earlier", ["diff", "quick-notes", "text-editor"]],
    ]);
  });

  test("name sort is one untitled section, A–Z", () => {
    const sections = library_sections(APPS, BASE);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBeNull();
    expect(names(sections)).toEqual(["Calculator", "Diff", "Quick Notes", "Snake", "Sudoku", "Text Editor"]);
  });

  test("category sort groups like the launcher, system last", () => {
    const sections = library_sections(APPS, { ...BASE, sort: LibrarySort.CATEGORY });
    expect(sections.map((section) => section.label)).toEqual(["Productivity", "Utilities", "Developer", "Games", "System"]);
  });

  test("category narrows", () => {
    expect(names(library_sections(APPS, { ...BASE, category: AppCategory.GAMES }))).toEqual(["Snake", "Sudoku"]);
    expect(names(library_sections(APPS, { ...BASE, category: LibraryCategory.SYSTEM }))).toEqual(["Text Editor"]);
  });

  test("search keeps the sort's order and tolerates a typo", () => {
    expect(names(library_sections(APPS, { ...BASE, query: "s" }))).toEqual(["Calculator", "Quick Notes", "Snake", "Sudoku"]);
    expect(names(library_sections(APPS, { ...BASE, query: "calculater" }))).toEqual(["Calculator"]);
  });

  test("filters combine with AND", () => {
    expect(names(library_sections(APPS, { ...BASE, filters: [LibraryFilter.FILES, LibraryFilter.COMMANDS] }))).toEqual([]);
    expect(names(library_sections(APPS, { ...BASE, filters: [LibraryFilter.FILES], category: AppCategory.DEVELOPER }))).toEqual(["Diff"]);
  });

  test("nothing left is no sections", () => {
    expect(library_sections(APPS, { ...BASE, query: "zzz" })).toEqual([]);
  });
});

describe("category_counts", () => {
  test("counts every category under the search and filters, All is the total", () => {
    const counts = category_counts(APPS, BASE);
    expect(counts).toMatchObject({ all: 6, games: 2, utilities: 1, developer: 1, productivity: 1, media: 0, system: 1 });
    expect(category_counts(APPS, { ...BASE, filters: [LibraryFilter.FILES] })).toMatchObject({ all: 2, developer: 1, system: 1, games: 0 });
  });
});

describe("details", () => {
  test("the app's commands from the registry, sorted by id", () => {
    expect(app_commands(APPS[4], COMMANDS).map((command) => command.id)).toEqual(["note", "note add"]);
    expect(app_commands(APPS[0], COMMANDS)).toEqual([]);
  });

  test("file types split into opens and works on, extensions first", () => {
    expect(app_file_types(APPS[3])).toEqual({ opens: [".md", "text/*"], works_on: [] });
    expect(app_file_types(APPS[5])).toEqual({ opens: [], works_on: [".txt"] });
  });
});

describe("showcase_sections", () => {
  test("one section per category in the nav's order, System last, apps A–Z", () => {
    const sections = showcase_sections(APPS, { query: "", category: LibraryCategory.ALL });
    expect(sections.map((section) => section.id)).toEqual([AppCategory.PRODUCTIVITY, AppCategory.UTILITIES, AppCategory.DEVELOPER, AppCategory.GAMES, LibraryCategory.SYSTEM]);
    expect(sections.find((section) => section.id === AppCategory.GAMES)?.apps.map((manifest) => manifest.name)).toEqual(["Snake", "Sudoku"]);
    expect(sections[0].label).toBe("Productivity");
  });

  test("a category keeps only its own section, and the search narrows", () => {
    expect(names(showcase_sections(APPS, { query: "", category: AppCategory.GAMES }))).toEqual(["Snake", "Sudoku"]);
    expect(names(showcase_sections(APPS, { query: "sudoku", category: LibraryCategory.ALL }))).toEqual(["Sudoku"]);
    expect(showcase_sections(APPS, { query: "", category: AppCategory.MEDIA })).toEqual([]);
  });
});

describe("app_story", () => {
  test("the pitch, or the description as the answer", () => {
    const pitch = { problem: "Sums are slow.", solution: "Type them." };
    expect(app_story(app("Calculator", { pitch, description: "Basic arithmetic." }))).toEqual(pitch);
    expect(app_story(app("Calculator", { description: "Basic arithmetic." }))).toEqual({ problem: null, solution: "Basic arithmetic." });
  });
});
