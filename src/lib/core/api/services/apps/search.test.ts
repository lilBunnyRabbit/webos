import { describe, expect, test } from "vitest";
import { AppCategory, type AppManifest } from "./type";
import { group_apps, search_apps } from "./search";

const app = (name: string, extra: Partial<AppManifest> = {}) =>
  ({ id: name.toLowerCase().replace(/\s+/g, "-"), name, category: AppCategory.UTILITIES, system: false, ...extra }) as AppManifest;

const names = (apps: AppManifest[]) => apps.map((manifest) => manifest.name);

describe("search_apps", () => {
  test("an empty query lists every app by name", () => {
    expect(names(search_apps([app("Snake"), app("Calculator")], "  "))).toEqual(["Calculator", "Snake"]);
  });

  test("ranks name prefix, then word prefix, then name substring, then other fields", () => {
    const apps = [
      app("Unit Converter", { keywords: ["scale"] }),
      app("Vocal Lab"),
      app("Work Calendar"),
      app("Calculator"),
      app("Notes", { description: "Recall later" }),
    ];
    expect(names(search_apps(apps, "cal"))).toEqual(["Calculator", "Work Calendar", "Vocal Lab", "Unit Converter", "Notes"]);
  });

  test("matches the category label and is case-insensitive", () => {
    const apps = [app("Snake", { category: AppCategory.GAMES }), app("Calculator")];
    expect(names(search_apps(apps, "GAMES"))).toEqual(["Snake"]);
  });

  test("no match is an empty list", () => {
    expect(search_apps([app("Snake")], "zzz")).toEqual([]);
  });
});

describe("group_apps", () => {
  test("sections follow category order with system last, skipping empty ones", () => {
    const apps = [
      app("Snake", { category: AppCategory.GAMES }),
      app("Settings", { system: true }),
      app("Paint", { category: AppCategory.MEDIA }),
      app("Minesweeper", { category: AppCategory.GAMES }),
    ];
    expect(group_apps(apps).map((section) => [section.label, names(section.apps)])).toEqual([
      ["Media", ["Paint"]],
      ["Games", ["Minesweeper", "Snake"]],
      ["System", ["Settings"]],
    ]);
  });
});
